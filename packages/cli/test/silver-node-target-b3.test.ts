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

// L1-CORE-1 B3 · Silver and the escrow rescue outside 18210. `silver deploy|spend|covenant genesis|transition` and
// `escrow rescue-v1 prepare|broadcast` ran on the canonical simnet localnet only. Now they take --network / --url like
// `tx *`: the endpoint is --url or the one the workspace declares; the canonical localnet is still proven by container
// + image digest (silver-keys-1 K-1 keeps that), and any other node by what it reports — network, version, synced, not
// the simulator — before any key is used against it or anything is sent. Mainnet is refused; testnet-<n> needs the
// payments' opt-in (experimental + network.allowPublic). Loopback fakes only; the canonical ports are denied, so a
// command that fell back to 18210 is caught by its connection log.

const FIXTURE = path.join(__dirname, "fixtures", "silver-keys-1", "vault-compile-record.json");
const ADDRESS = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
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
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-b3-logs-"));
made.push(logs);

// The fakes live in this process: the CLI runs asynchronously (a spawnSync would block them, and every connection to
// them would time out).
async function run(name: string, args: string[], cwd = ws) {
  const log = path.join(logs, `${name}.net.log`);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], {
      cwd,
      env: hermeticChildEnv(log, { HARDKAS_HERMETIC_DENY_PORTS: "16110,16210,17110,17210,18110,18210,18211", DOCKER_HOST: "tcp://127.0.0.1:9", HK_B3_PW: PW }),
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
  return { status: r.status, json, code, dialled, all, brief: `exit ${r.status}\n${all.slice(0, 1500)}\n${JSON.stringify(dialled)}` };
}

/** A simnet workspace (dev accounts) whose simnet is an RPC node at `url`. */
function workspace(label: string, url: string, extra: Record<string, unknown> = {}): string {
  const dir = path.join(parent, label);
  const init = spawnSync(process.execPath, [cliDist, "init", label, "--network", "simnet", "--skip-toolchain", "--json"], { cwd: parent, encoding: "utf8", env: hermeticChildEnv(path.join(logs, `${label}-init.net.log`)), timeout: 120_000 });
  expect(init.status, `${init.stdout}\n${init.stderr}`).toBe(0);
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: url } },
    ...extra
  };
  fs.writeFileSync(path.join(dir, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  // a funder with a local key: an encrypted simnet account (the presets of `init` are addresses only)
  const gen = spawnSync(process.execPath, [cliDist, "accounts", "real", "generate", "--name", "funder", "--network", "simnet", "--password-env", "HK_B3_PW", "--json"], {
    cwd: dir,
    encoding: "utf8",
    env: hermeticChildEnv(path.join(logs, `${label}-gen.net.log`), { HK_B3_PW: PW }),
    timeout: 120_000
  });
  expect(gen.status, `${gen.stdout}\n${gen.stderr}`).toBe(0);
  return dir;
}

const PW = "b3-node-target-password";

const canonicalDialled = (d: string[]) => d.filter((x) => /:(16110|16210|17110|17210|18110|18210|18211)$/.test(x));

beforeAll(async () => {
  assertHermeticPreloadActive();
  synced = await startFake("simnet", true);
  unsynced = await startFake("simnet", false);
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-b3-"));
  made.push(parent);
  ws = workspace("own-node", synced.url);
});

afterAll(async () => {
  await synced?.close();
  await unsynced?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("L1-CORE-1 B3 · Silver and the escrow rescue on a node that is not the canonical localnet", () => {
  it("B3-1 `silver deploy` on the workspace's own simnet node (not 18210): proven by what it reports, then used; never the canonical ports", async () => {
    const r = await run("deploy-own", ["silver", "deploy", FIXTURE, "--from", "funder", "--password-env", "HK_B3_PW", "--amount", "1", "--json"]);
    // the fake proves its identity and refuses the reads that follow: the command fails AFTER the identity check
    expect(r.status, r.brief).not.toBe(0);
    expect(r.code, r.brief).not.toMatch(/NODE_IDENTITY_UNVERIFIED|SILVER_NETWORK_NOT_SUPPORTED|PUBLIC_NETWORK_BLOCKED/);
    expect(synced.methods, r.brief).toContain("getServerInfo");
    expect(synced.methods.some((m) => m !== "getServerInfo"), r.brief).toBe(true);
    expect(canonicalDialled(r.dialled), r.brief).toEqual([]);
    expect(r.dialled.some((d) => d.endsWith(`:${synced.port}`)), r.brief).toBe(true);
  });

  // INT9-A (I-3b, changed on purpose): the refusal is the same (nothing but its identity asked, no key used), but its
  // code is now NODE_NOT_SYNCED: the node proved its identity, and being synced is a separate verdict.
  it("B3-2 `silver deploy --url` a node that is not synced: NODE_NOT_SYNCED before anything else is asked of it", async () => {
    const before = unsynced.methods.length;
    const r = await run("deploy-unsynced", ["silver", "deploy", FIXTURE, "--from", "funder", "--password-env", "HK_B3_PW", "--amount", "1", "--url", unsynced.url, "--json"]);
    expect(r.code, r.brief).toBe("NODE_NOT_SYNCED");
    expect(r.all, r.brief).toMatch(/not synced/);
    expect(unsynced.methods.slice(before).filter((m) => m !== "getServerInfo"), r.brief).toEqual([]);
    expect(canonicalDialled(r.dialled), r.brief).toEqual([]);
  });

  it("B3-3 `--network testnet-10` without the payments' opt-in: PUBLIC_NETWORK_BLOCKED, nothing contacted", async () => {
    const r = await run("deploy-tn10", ["silver", "deploy", FIXTURE, "--from", "funder", "--password-env", "HK_B3_PW", "--amount", "1", "--network", "testnet-10", "--json"]);
    expect(r.code, r.brief).toBe("PUBLIC_NETWORK_BLOCKED");
    expect(r.dialled.filter((d) => d.startsWith("LOOPBACK_CONNECT") || d.startsWith("REFUSED")), r.brief).toEqual([]);
  });

  it("B3-4 `--network mainnet` is refused, nothing contacted", async () => {
    for (const [label, args] of [
      ["deploy-mainnet", ["silver", "deploy", FIXTURE, "--from", "funder", "--password-env", "HK_B3_PW", "--amount", "1", "--network", "mainnet", "--json"]],
      ["rescue-mainnet", ["escrow", "rescue-v1", "prepare", "--address", ADDRESS, "--outpoint", `${"a".repeat(64)}:0`, "--to", ADDRESS, "--network", "mainnet", "--json"]]
    ] as const) {
      const r = await run(label, [...args]);
      expect(r.status, r.brief).not.toBe(0);
      expect(r.code, r.brief).toMatch(/MAINNET/);
      expect(r.dialled.filter((d) => d.startsWith("LOOPBACK_CONNECT")), r.brief).toEqual([]);
    }
  });

  // INT9-A (I-3b, changed on purpose): same refusal point, code NODE_NOT_SYNCED (identity proven, sync not)
  it("B3-5 `escrow rescue-v1 prepare --url` an unsynced node: NODE_NOT_SYNCED before its UTXOs are read (it read the canonical endpoint, unproven)", async () => {
    const before = unsynced.methods.length;
    const r = await run("rescue-unsynced", ["escrow", "rescue-v1", "prepare", "--address", ADDRESS, "--outpoint", `${"a".repeat(64)}:0`, "--to", ADDRESS, "--url", unsynced.url, "--json"]);
    expect(r.code, r.brief).toBe("NODE_NOT_SYNCED");
    expect(unsynced.methods.slice(before).filter((m) => m !== "getServerInfo"), r.brief).toEqual([]);
    expect(canonicalDialled(r.dialled), r.brief).toEqual([]);
  });
});
