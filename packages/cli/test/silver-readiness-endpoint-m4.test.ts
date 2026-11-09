import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// INT9-C5 · L1-CORE-1 B6 review M-4: `silver doctor` and `capabilities` judged Silver's on-chain readiness by the
// canonical localnet only. Since B3, `silver deploy|spend|covenant` run on any node that proves its identity by what it
// reports (`--url`, or the endpoint the workspace declares), so without the canonical localnet they said "not ready"
// for a node the commands would use. Now both check the node the Silver commands would use: `--url`/`--network`, else
// the workspace's network and endpoint; the canonical localnet is still proven by container + image digest, any other
// node by what it reports. Mainnet is refused before anything is contacted. Loopback fakes only; the canonical ports
// are denied, so a check that fell back to 18210 is caught by its connection log.

type Fake = { url: string; port: number; methods: string[]; close(): Promise<void> };

/** A wRPC JSON fake that identifies itself (getServerInfo) and refuses everything else. */
async function startFake(network: string, synced: boolean): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const methods: string[] = [];
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      if (!id) return;
      methods.push(method);
      if (method === "getServerInfo") {
        const info = { rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: network, hasUtxoIndex: true, isSynced: synced, virtualDaaScore: 5000 };
        return socket.send(`{"id":${id},"method":"getServerInfo","params":${JSON.stringify(info)}}`);
      }
      socket.send(`{"id":${id},"error":{"code":1,"message":"fake node refuses ${method}"}}`);
    });
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `ws://127.0.0.1:${port}`,
    port,
    methods,
    close: () =>
      new Promise<void>((r) => {
        for (const c of server.clients) c.terminate();
        server.close(() => r());
      })
  };
}

const made: string[] = [];
let synced: Fake;
let unsynced: Fake;
let parent = "";
let ws = "";
let bare = "";
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-m4-logs-"));
made.push(logs);
const DENY = "16110,16210,17110,17210,18110,18210,18211";
const canonicalDialled = (d: string[]) => d.filter((x) => /:(16110|16210|17110|17210|18110|18210|18211)$/.test(x));

// The fakes live in this process: the CLI runs asynchronously (a spawnSync would block them).
async function run(name: string, args: string[], cwd = ws) {
  const log = path.join(logs, `${name}.net.log`);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], {
      cwd,
      env: hermeticChildEnv(log, { HARDKAS_HERMETIC_DENY_PORTS: DENY, DOCKER_HOST: "tcp://127.0.0.1:9", HARDKAS_EXPERIMENTAL: "1" }),
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 150_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split("\t").slice(1, 3).join(" ")) : [];
  let json: any;
  try {
    json = JSON.parse((r.stdout ?? "").trim());
  } catch {
    json = undefined;
  }
  const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const code = json?.code ?? json?.error?.code ?? /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)\b/.exec(all)?.[1];
  return { status: r.status, json, code, dialled, all, brief: `exit ${r.status}\n${all.slice(0, 2000)}\n${JSON.stringify(dialled)}` };
}

/** A simnet workspace whose simnet is an RPC node at `url`. */
function workspace(label: string, url: string): string {
  const dir = path.join(parent, label);
  const init = spawnSync(process.execPath, [cliDist, "init", label, "--network", "simnet", "--skip-toolchain", "--json"], {
    cwd: parent,
    encoding: "utf8",
    env: hermeticChildEnv(path.join(logs, `${label}-init.net.log`)),
    timeout: 120_000
  });
  expect(init.status, `${init.stdout}\n${init.stderr}`).toBe(0);
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: url } }
  };
  fs.writeFileSync(path.join(dir, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  return dir;
}

/** The toolchains do not depend on the node: `ready` is theirs and the node's, nothing else. */
function expectReadyFromChecks(doc: any, nodeOk: boolean, brief: string) {
  const tools = doc.toolchains.silverc.ok === true && doc.toolchains["kaspa-wasm"].ok === true;
  expect(doc.node.ok, brief).toBe(nodeOk);
  expect(doc.ready["silver.compile.v1"], brief).toBe(doc.toolchains.silverc.ok === true);
  expect(doc.ready["silver.p2sh.deploy-spend.v1"], brief).toBe(tools && nodeOk);
  expect(doc.ready["toccata.covenant.auth-1to1-transition.v1"], brief).toBe(tools && nodeOk);
}

beforeAll(async () => {
  assertHermeticPreloadActive();
  synced = await startFake("simnet", true);
  unsynced = await startFake("simnet", false);
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-m4-"));
  made.push(parent);
  ws = workspace("own-node", synced.url);
  bare = fs.mkdtempSync(path.join(os.tmpdir(), "hk-m4-bare-"));
  made.push(bare);
});

afterAll(async () => {
  await synced?.close();
  await unsynced?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("INT9-C5 · silver doctor and capabilities check the node the Silver commands would use", () => {
  it("M4-1 `silver doctor --url` a node that proves itself by what it reports: node ok, verified by endpoint, never the canonical ports", async () => {
    const r = await run("doctor-url", ["silver", "doctor", "--url", synced.url, "--json"], bare);
    expect(r.status, r.brief).toBe(0);
    expect(r.json?.node?.verification, r.brief).toBe("endpoint");
    expect(r.json?.node?.url, r.brief).toBe(synced.url);
    expect(r.json?.node?.network, r.brief).toBe("simnet");
    expectReadyFromChecks(r.json, true, r.brief);
    expect(synced.methods, r.brief).toContain("getServerInfo");
    expect(canonicalDialled(r.dialled), r.brief).toEqual([]);
  });

  it("M4-2 `silver doctor` in a workspace that declares its own simnet node: that node is checked, as `silver deploy` would use it", async () => {
    const before = synced.methods.length;
    const r = await run("doctor-ws", ["silver", "doctor", "--json"]);
    expect(r.status, r.brief).toBe(0);
    expect(r.json?.node?.verification, r.brief).toBe("endpoint");
    expect(r.json?.node?.url, r.brief).toBe(synced.url);
    expectReadyFromChecks(r.json, true, r.brief);
    expect(synced.methods.slice(before), r.brief).toContain("getServerInfo");
    expect(canonicalDialled(r.dialled), r.brief).toEqual([]);
  });

  it("M4-3 `silver doctor --url` a node that is not synced: node not ok, says why, nothing else asked of it", async () => {
    const before = unsynced.methods.length;
    const r = await run("doctor-unsynced", ["silver", "doctor", "--url", unsynced.url, "--json"], bare);
    expect(r.status, r.brief).toBe(0);
    expectReadyFromChecks(r.json, false, r.brief);
    expect(r.json?.node?.detail, r.brief).toMatch(/not synced/);
    expect(unsynced.methods.slice(before).filter((m) => m !== "getServerInfo"), r.brief).toEqual([]);
    expect(canonicalDialled(r.dialled), r.brief).toEqual([]);
  });

  it("M4-4 `silver doctor --network mainnet` is refused before anything is contacted", async () => {
    const r = await run("doctor-mainnet", ["silver", "doctor", "--network", "mainnet", "--json"], bare);
    expect(r.status, r.brief).not.toBe(0);
    expect(r.code, r.brief).toMatch(/MAINNET/);
    expect(r.dialled.filter((d) => d.startsWith("LOOPBACK_CONNECT")), r.brief).toEqual([]);
  });

  it("M4-5 `silver doctor --network testnet-10` without the payments' opt-in: reported as blocked, nothing contacted", async () => {
    const r = await run("doctor-tn10", ["silver", "doctor", "--network", "testnet-10", "--json"], bare);
    expect(r.status, r.brief).toBe(0);
    expectReadyFromChecks(r.json, false, r.brief);
    expect(r.json?.node?.detail, r.brief).toMatch(/PUBLIC_NETWORK_BLOCKED/);
    expect(r.dialled.filter((d) => d.startsWith("LOOPBACK_CONNECT") || d.startsWith("REFUSED")), r.brief).toEqual([]);
  });

  it("M4-6 without the canonical localnet and without --url, the reason tells how to check another node", async () => {
    const r = await run("doctor-canonical", ["silver", "doctor", "--json"], bare);
    expect(r.status, r.brief).toBe(0);
    expect(r.json?.node?.verification, r.brief).toBe("canonical");
    expectReadyFromChecks(r.json, false, r.brief);
    expect(r.json?.node?.detail, r.brief).toMatch(/--url/);
  });

  it("M4-7 `capabilities --json` in the workspace with its own node: covenants derive from that node, as silver doctor reports", async () => {
    const doctor = await run("doctor-ws-2", ["silver", "doctor", "--json"]);
    const caps = await run("caps-ws", ["capabilities", "--json"]);
    expect(caps.status, caps.brief).toBe(0);
    expect(caps.json?.capabilities?.covenants, caps.brief).toBe(doctor.json?.ready?.["toccata.covenant.auth-1to1-transition.v1"]);
    expect(caps.json?.runtimeMatrix?.node?.toccata, caps.brief).toBe(true);
    expect(caps.json?.reasons?.covenants ?? "", caps.brief).not.toMatch(/canonical node did not prove its identity/);
    expect(canonicalDialled(caps.dialled), caps.brief).toEqual([]);
  });

  it("M4-8 `capabilities --json --url` an unsynced node: covenants false, and the reason names that node, not the canonical one", async () => {
    const caps = await run("caps-unsynced", ["capabilities", "--url", unsynced.url, "--json"], bare);
    expect(caps.status, caps.brief).toBe(0);
    expect(caps.json?.capabilities?.covenants, caps.brief).toBe(false);
    // INT9 (A × C5): since front A, an unsynced node proves its identity and fails on sync, a verdict apart; the reason
    // says so (it said "did not prove its identity" while sync was part of the endpoint identity)
    expect(caps.json?.reasons?.covenants, caps.brief).toMatch(new RegExp(`node at ${unsynced.url.replace(/[.]/g, "\\.")} is not synced \\(NODE_NOT_SYNCED\\)`));
    expect(canonicalDialled(caps.dialled), caps.brief).toEqual([]);
  });
});
