// L1-CORE-1 B4 · localnet start|status, hermetic, at runner level (the real Docker path runs in the simnet suites).
// Docker is a double: `execa` (the runner's docker CLI calls) and `node:child_process` execFile (the identity probe's
// `docker container/image inspect`) are mocked like packages/cli/test/localnet-stop-profile.test.ts mocks execa; the
// canonical wRPC endpoint is a mocked client and the port probes are mocked sockets, so no canonical port is bound or
// dialled. Asserted: the `docker run` it would make (the pinned image by digest, loopback-only publishes, the
// workspace's data dir), the JSON payload of a verified start and of status, and its typed refusals: no profile, an
// unmanaged node already on the canonical port, Docker unreachable.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CANONICAL_LOCALNET, KASPAD_REFERENCE_DIGEST } from "@hardkas/core";
import { tempDir, removeDir } from "./helpers/l1-core-1-b4.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const h = vi.hoisted(() => ({
  dockerDown: false,
  node: "absent" as "absent" | "running",
  rpcReady: false,
  digest: "",
  publish: [] as string[],
  execa: [] as string[][],
  execFile: [] as string[][],
  listened: [] as number[],
  dialled: [] as number[]
}));

const DOCKER_DOWN = "Cannot connect to the Docker daemon at tcp://127.0.0.1:1. Is the docker daemon running?";
const NODE = "hardkas-kaspad-toccata-v2";

vi.mock("execa", () => ({
  execa: vi.fn(async (_cmd: string, args: string[]) => {
    h.execa.push([...args]);
    if (h.dockerDown) throw Object.assign(new Error(DOCKER_DOWN), { exitCode: 1, stderr: DOCKER_DOWN });
    const name = args[args.length - 1];
    if (args[0] === "version") return { stdout: "27.0.0" };
    if (args[0] === "inspect") {
      if (name !== NODE || h.node === "absent") throw Object.assign(new Error(`Error: No such object: ${name}`), { exitCode: 1, stderr: `Error: No such object: ${name}` });
      const format = String(args[2] ?? "");
      if (format.includes("State.Running")) return { stdout: "true" };
      if (format.includes("Config.Image")) return { stdout: `running|image|/${name}` };
      return { stdout: "running" };
    }
    if (args[0] === "run" && args.includes(NODE)) {
      h.publish = args.filter((_, i) => args[i - 1] === "-p");
      h.node = "running";
      return { stdout: "c0ffee" };
    }
    return { stdout: "" };
  })
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual: any = await importOriginal();
  const execFile = (file: string, args: string[], opts: any, cb?: any) => {
    const callback = typeof opts === "function" ? opts : cb;
    if (file !== "docker") return actual.execFile(file, args, opts, cb);
    h.execFile.push([...args]);
    const done = (err: Error | null, out = "") => process.nextTick(() => callback(err, out, err ? err.message : ""));
    if (h.dockerDown) return done(new Error(`error during connect: ${DOCKER_DOWN}`));
    if (args[0] === "container" && args[1] === "inspect") {
      if (h.node !== "running" || args[2] !== NODE) return done(new Error(`Error: No such container: ${args[2]}`));
      const ports: Record<string, Array<{ HostIp: string; HostPort: string }>> = {};
      for (const p of h.publish) {
        const [ip, hostPort, containerPort] = p.split(":");
        (ports[`${containerPort}/tcp`] ??= []).push({ HostIp: ip!, HostPort: hostPort! });
      }
      return done(null, JSON.stringify([{ Name: `/${NODE}`, Id: "c0ffee", State: { Running: true }, Image: "sha256:image-id", NetworkSettings: { Ports: ports } }]));
    }
    if (args[0] === "image" && args[1] === "inspect") return done(null, JSON.stringify([{ RepoDigests: [`kaspanet/rusty-kaspad@${h.digest}`] }]));
    return done(new Error(`unexpected docker ${args.join(" ")}`));
  };
  return { ...actual, execFile, default: { ...(actual.default ?? actual), execFile } };
});

vi.mock("node:net", async (importOriginal) => {
  const actual: any = await importOriginal();
  const { EventEmitter } = await import("node:events");
  const createServer = () => {
    const ee = new EventEmitter();
    return {
      once: (ev: string, fn: (...a: any[]) => void) => ee.once(ev, fn),
      listen: (port: number) => {
        h.listened.push(port);
        process.nextTick(() => ee.emit("listening"));
      },
      close: (fn?: () => void) => fn?.()
    };
  };
  class Socket extends EventEmitter {
    setTimeout() {}
    destroy() {}
    connect(port: number) {
      h.dialled.push(port);
      process.nextTick(() => this.emit("connect"));
      return this;
    }
  }
  return { ...actual, createServer, Socket, default: { ...(actual.default ?? actual), createServer, Socket } };
});

vi.mock("@hardkas/kaspa-rpc", async (importOriginal) => {
  const actual: any = await importOriginal();
  class JsonWrpcKaspaClient {
    constructor(public readonly options: any) {}
    async getServerInfo() {
      if (!h.rpcReady) throw new Error("wRPC -> WebSocket -> Unable to connect");
      return { networkId: "simnet", serverVersion: "2.1.0", isSynced: true, hasUtxoIndex: true };
    }
    async getInfo() {
      if (!h.rpcReady) throw new Error("wRPC -> WebSocket -> Unable to connect");
      return { networkId: "simnet", serverVersion: "2.1.0", isSynced: true, virtualDaaScore: 1234n };
    }
    async close() {}
  }
  return {
    ...actual,
    JsonWrpcKaspaClient,
    waitForKaspaRpcReady: vi.fn(async () => {
      h.rpcReady = true;
      return { ready: true };
    }),
    checkKaspaRpcHealth: vi.fn(async () => ({ ready: h.rpcReady }))
  };
});

import { runLocalnetStart, runLocalnetStatus } from "../src/runners/localnet-runners.js";
import { setGlobalOutput } from "../src/output.js";

let ws: string;
let printed: unknown[];

beforeAll(() => {
  h.digest = KASPAD_REFERENCE_DIGEST;
  ws = tempDir("hk-b4-localnet-start-");
});
afterAll(() => removeDir(ws));

beforeEach(() => {
  Object.assign(h, { dockerDown: false, node: "absent", rpcReady: false, publish: [], execa: [], execFile: [], listened: [], dialled: [] });
  printed = [];
  setGlobalOutput({
    writeLine: (s: string) => printed.push(s),
    writeJson: (o: unknown) => printed.push(o),
    error: (s: string) => printed.push(s),
    warn: (s: string) => printed.push(s),
    info: (s: string) => printed.push(s)
  } as any);
});

const payload = () => printed.find((p) => typeof p === "object" && p !== null) as any;
const dockerRun = () => h.execa.find((a) => a[0] === "run" && a.includes(NODE));
const outcome = (p: Promise<unknown>) => p.then(() => ({ ok: true as const, error: undefined as any }), (error: any) => ({ ok: false as const, error }));

describe("localnet start --profile toccata-v2 (Docker mocked)", () => {
  it("starts the pinned node: docker run with the image by digest, loopback-only publishes, the workspace's data dir; READY and VERIFIED", async () => {
    await runLocalnetStart({ profile: "toccata-v2", json: true, workspaceRoot: ws });
    const args = dockerRun();
    expect(args, JSON.stringify(h.execa)).toBeDefined();
    expect(args).toContain(CANONICAL_LOCALNET.image);
    expect(CANONICAL_LOCALNET.image).toMatch(/@sha256:[0-9a-f]{64}$/);
    expect(args!.slice(args!.indexOf("--name"), args!.indexOf("--name") + 2)).toEqual(["--name", NODE]);
    const publishes = args!.filter((_, i) => args![i - 1] === "-p");
    expect(publishes.sort()).toEqual(Object.values(CANONICAL_LOCALNET.ports).map((p) => `127.0.0.1:${p}:${p}`).sort());
    expect(args).toContain("--simnet");
    expect(args).toContain(`${path.resolve(ws, ".hardkas", "kaspad")}:/app/data`);
    expect(fs.existsSync(path.join(ws, ".hardkas", "kaspad"))).toBe(true);

    expect(payload()).toMatchObject({ schema: "hardkas.localnetStatus.v1", profile: "toccata-v2", status: "TOCCATA_NODE_READY", node: { running: true, rpcReady: true }, identity: { verified: true } });
    // the dev accounts alice..erin are created in the workspace
    expect(fs.readdirSync(path.join(ws, ".hardkas", "dev-accounts")).sort()).toEqual(["alice.json", "bob.json", "carol.json", "dave.json", "erin.json"]);
  });

  // L1-CORE-1 B4 (was a known gap): the canonical node ran with no label saying HardKAS started it
  it("the docker run labels the container as HardKAS-managed (hardkas.role=localnet-node)", async () => {
    await runLocalnetStart({ profile: "toccata-v2", json: true, workspaceRoot: ws });
    const args = dockerRun()!;
    const labels = args.filter((_, i) => args[i - 1] === "--label");
    expect(labels, JSON.stringify(args)).toContain("hardkas.role=localnet-node");
  });

  it("the port probe checks the three canonical ports through the mocked sockets (no real port is bound)", async () => {
    await runLocalnetStart({ profile: "toccata-v2", json: true, workspaceRoot: ws });
    expect([...h.listened].sort((a, b) => a - b)).toEqual(Object.values(CANONICAL_LOCALNET.ports).sort((a, b) => a - b));
  });

  it("Docker unreachable: the typed DOCKER_UNAVAILABLE, no docker run, nothing reported READY", async () => {
    h.dockerDown = true;
    const r = await outcome(runLocalnetStart({ profile: "toccata-v2", json: true, workspaceRoot: ws }));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe("DOCKER_UNAVAILABLE");
    expect(dockerRun()).toBeUndefined();
    expect(payload()).toBeUndefined();
  });

  it("no profile, or the simulated one: LOCALNET_PROFILE_REQUIRED before Docker is touched", async () => {
    for (const profile of [undefined, "simulated"]) {
      const r = await outcome(runLocalnetStart({ profile, json: true, workspaceRoot: ws }));
      expect(r.error?.code).toBe("LOCALNET_PROFILE_REQUIRED");
    }
    expect(h.execa).toEqual([]);
  });

  it("an unmanaged node already answering on the canonical endpoint: LOCALNET_PORT_CONFLICT, not adopted, no docker run", async () => {
    h.rpcReady = true;
    const r = await outcome(runLocalnetStart({ profile: "toccata-v2", json: true, workspaceRoot: ws }));
    expect(r.error?.code).toBe("LOCALNET_PORT_CONFLICT");
    expect(dockerRun()).toBeUndefined();
  });
});

describe("localnet status (Docker mocked)", () => {
  it("a verified running node: node ready, identity VERIFIED with the observed digest, miner reported, levels stated", async () => {
    h.node = "running";
    h.rpcReady = true;
    h.publish = Object.values(CANONICAL_LOCALNET.ports).map((p) => `127.0.0.1:${p}:${p}`);
    await runLocalnetStatus({ json: true, workspaceRoot: ws });
    expect(payload()).toMatchObject({
      schema: "hardkas.localnetStatus.v1",
      profile: "toccata-v2",
      node: { ready: true, networkId: "simnet", serverVersion: "2.1.0" },
      identity: { verified: true, observedImageDigest: KASPAD_REFERENCE_DIGEST },
      miner: { exists: false, running: false },
      simulationLevels: { artifactCoherence: "READY", runtimeOutcome: "PARTIAL", vmConsensusEquivalence: "NOT_CLAIMED" }
    });
  });

  it("Docker unreachable and no node: reported as not ready and UNVERIFIED (with why), never READY or VERIFIED", async () => {
    h.dockerDown = true;
    await runLocalnetStatus({ json: true, workspaceRoot: ws });
    const p = payload();
    expect(p.node.ready).toBe(false);
    expect(p.identity.verified).toBe(false);
    expect(p.identity.problems.join("\n")).toMatch(/docker unavailable/);
    expect(p.miner.running).toBe(false);
  });

});
