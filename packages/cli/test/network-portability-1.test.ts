import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// HARDKAS-NETWORK-PORTABILITY-1 · Stage A (2026-10-16). The same engine commands must behave on testnet-10 as on simnet
// when the operation fits the network, and refuse what does not. Found by the TN10 coverage sweep of the demo:
//   C1 `accounts list` / resolution offered the simnet presets (kaspasim:) in a testnet-10 workspace;
//   C2 `tx plan` with nothing spendable answered UNKNOWN_ERROR on an RPC network;
//   C5 `rpc *` only reached the canonical localnet unless given a raw --url (no network identity check);
//      `rpc health` had no way to point elsewhere; `rpc doctor` probed port 18210 for a URL without a port;
//   C6 `doctor` never checked the workspace's network endpoint;
//   run: a fixed `simnet` default, unknown networks silently simulated, an RPC global without the identity check;
//   test: `--network` was only a label (default "simnet") that could contradict the network the scenarios ran on.
// SilverScript (C7) is covered by network-portability-1.silverc.test.ts (needs the pinned silverc).
// Loopback fakes only; every child's connection attempts are logged by the hermetic preload.
// -----------------------------------------------------------------------------

const PW_VAR = "HK_NP_TEST_PW";
const DAA = 90_000_000;
const hashOf = (n: number) => n.toString(16).padStart(64, "0");

type Utxo = { transactionId: string; index: number; amount: number; blockDaaScore: number; isCoinbase: boolean };
type Fake = { url: string; port: number; methods: string[]; utxos: Map<string, Utxo[]>; close(): Promise<void> };
async function startFake(network: string): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r, j) => {
    server.on("listening", () => r());
    server.on("error", j);
  });
  const fake: Fake = { url: "", port: 0, methods: [], utxos: new Map(), close: async () => {} };
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try {
        params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params;
      } catch {
        params = undefined;
      }
      fake.methods.push(method);
      if (!id) return;
      const ok = (r: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(r)}}`);
      const err = (m: string) => socket.send(`{"id":${id},"error":{"code":0,"message":${JSON.stringify(m)},"data":null}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: network, hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getInfo":
          return ok({ p2pId: "np", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({ network, blockCount: 10, headerCount: 10, tipHashes: [hashOf(1)], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [hashOf(1)], pruningPointHash: hashOf(2), virtualDaaScore: DAA, sink: hashOf(1) });
        case "getSinkBlueScore":
          return ok({ blueScore: DAA - 1000 });
        case "getFeeEstimate":
          return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
        case "getUtxosByAddresses":
          return ok({
            entries: (params?.addresses ?? []).flatMap((address: string) =>
              (fake.utxos.get(address) ?? []).map((u) => ({
                address,
                outpoint: { transactionId: u.transactionId, index: u.index },
                utxoEntry: { amount: u.amount, blockDaaScore: u.blockDaaScore, covenantId: null, isCoinbase: u.isCoinbase, scriptPublicKey: "0000" }
              }))
            )
          });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: (fake.utxos.get(address) ?? []).reduce((s, u) => s + u.amount, 0) })) });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: [] });
        case "getMempoolEntries":
          return ok({ mempoolEntries: [] });
        case "getMempoolEntry":
          return err(`Transaction ${params?.transactionId} not found`);
        case "submitTransaction":
          return err("network-portability fake: never accepts a submission");
        default:
          return err(`fake does not implement ${method}`);
      }
    });
  });
  fake.port = (server.address() as AddressInfo).port;
  fake.url = `ws://127.0.0.1:${fake.port}`;
  fake.close = () =>
    new Promise<void>((r) => {
      for (const c of server.clients) c.terminate();
      server.close(() => r());
    });
  return fake;
}

const made: string[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-np-netlogs-"));
made.push(logs);
const traceDir = process.env.HARDKAS_NP_TRACE_DIR;
function trace(name: string, data: unknown) {
  if (!traceDir) return;
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(path.join(traceDir, `${name}.json`), JSON.stringify(data, null, 2));
}

async function run(name: string, args: string[], cwd: string) {
  const log = path.join(logs, `${name}.net.log`);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: hermeticChildEnv(log, { [PW_VAR]: "np-test-password-only" }) });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 100_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
  const dialled = fs.existsSync(log)
    ? [...new Set(fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split("\t")).map(([, k, t]) => `${k} ${t}`))]
    : [];
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  const out = { name, exit: r.status, json, dialled, stdout: r.stdout, stderr: r.stderr, brief: `exit ${r.status}\n${r.stdout.slice(-2000)}\n${r.stderr.slice(0, 1500)}` };
  trace(name, { exit: out.exit, json: out.json, dialled: out.dialled, stdout: r.stdout.slice(-4000), stderr: r.stderr.slice(0, 2000) });
  return out;
}

function workspace(label: string, network: "simnet" | "testnet-10", rpcUrl?: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-np-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg =
    network === "simnet"
      ? { execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } } }
      : {
          execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
          network: { allowPublic: true },
          experimental: true,
          networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl } }
        };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  return ws;
}

let T: Fake; // says testnet-10
let M: Fake; // says mainnet
let kaspa: any;
const FUNDED = { address: "" };

beforeAll(async () => {
  assertHermeticPreloadActive();
  const coreMod: any = await import("@hardkas/core");
  kaspa = coreMod.loadManagedKaspaWasmSync();
  FUNDED.address = new kaspa.PrivateKey("77".repeat(32)).toAddress("testnet-10").toString();
  T = await startFake("testnet-10");
  M = await startFake("mainnet");
});
afterAll(async () => {
  await T?.close();
  await M?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const loopbackOnly = (dialled: string[], port: number) => dialled.every((d) => d === `LOOPBACK_CONNECT 127.0.0.1:${port}`);

describe("C1 · accounts belong to their network", () => {
  it("NP-1 testnet-10 workspace: `accounts list` offers no simnet preset; every entry says its network", async () => {
    const ws = workspace("c1t", "testnet-10", T.url);
    await run("NP-1-gen", ["accounts", "real", "generate", "--name", "tn-own", "--network", "testnet-10", "--password-env", PW_VAR, "--json"], ws);
    const r = await run("NP-1", ["accounts", "list", "--json"], ws);
    expect(r.exit, r.brief).toBe(0);
    const list = r.json as Array<{ name: string; address?: string; network?: string }>;
    expect(list.map((a) => a.name), r.brief).toEqual(["tn-own"]);
    expect(list.every((a) => !String(a.address).startsWith("kaspasim:")), r.brief).toBe(true);
    expect(list[0]!.network).toBe("testnet-10");
    expect(r.dialled).toEqual([]);
  });

  it("NP-1b testnet-10 workspace: a simnet preset name is not an account there (no kaspasim: address is resolved)", async () => {
    const ws = workspace("c1b", "testnet-10", T.url);
    const r = await run("NP-1b", ["accounts", "balance", "alice", "--network", "testnet-10", "--json"], ws);
    expect(r.exit, r.brief).not.toBe(0);
    expect(r.stdout + r.stderr).not.toMatch(/kaspasim:/);
    expect(r.stdout + r.stderr).toMatch(/Unknown HardKAS account 'alice'/);
  });

  it("NP-1c (contract) simnet workspace: the presets are still listed, as simnet accounts", async () => {
    const ws = workspace("c1s", "simnet");
    const r = await run("NP-1c", ["accounts", "list", "--json"], ws);
    expect(r.exit, r.brief).toBe(0);
    const list = r.json as Array<{ name: string; address?: string; network?: string }>;
    expect(list.map((a) => a.name)).toEqual(expect.arrayContaining(["alice", "bob", "carol", "dave", "erin"]));
    expect(list.filter((a) => ["alice", "bob"].includes(a.name)).every((a) => String(a.address).startsWith("kaspasim:") && a.network === "simnet")).toBe(true);
  });
});

describe("C2 · nothing spendable is a typed refusal on every backend", () => {
  it("NP-2 testnet-10 (RPC): no UTXOs → NO_SPENDABLE_UTXOS, not UNKNOWN_ERROR; nothing planned", async () => {
    const ws = workspace("c2", "testnet-10", T.url);
    const empty = new kaspa.PrivateKey("78".repeat(32)).toAddress("testnet-10").toString();
    const r = await run("NP-2", ["tx", "plan", "--from", empty, "--to", FUNDED.address, "--amount", "1", "--network", "testnet-10", "--json"], ws);
    expect(r.exit, r.brief).toBe(1);
    expect(r.json?.code, r.brief).toBe("NO_SPENDABLE_UTXOS");
    expect(r.json?.message).toMatch(/no UTXOs/i);
    expect(loopbackOnly(r.dialled, T.port)).toBe(true);
  });

  it("NP-2b testnet-10 (RPC): only immature coinbase outputs → NO_SPENDABLE_UTXOS that says they are immature", async () => {
    const ws = workspace("c2b", "testnet-10", T.url);
    const miner = new kaspa.PrivateKey("79".repeat(32)).toAddress("testnet-10").toString();
    T.utxos.set(miner, [{ transactionId: hashOf(0xc0), index: 0, amount: 50_00000000, blockDaaScore: DAA - 5, isCoinbase: true }]);
    const r = await run("NP-2b", ["tx", "plan", "--from", miner, "--to", FUNDED.address, "--amount", "1", "--network", "testnet-10", "--json"], ws);
    expect(r.exit, r.brief).toBe(1);
    expect(r.json?.code, r.brief).toBe("NO_SPENDABLE_UTXOS");
    expect(r.json?.message).toMatch(/1 UTXO.*none mature|immature/i);
  });
});

describe("C5 · rpc commands follow a declared network, with its identity checked", () => {
  it("NP-3 `rpc info --network testnet-10`: the workspace's endpoint for that network, identity checked", async () => {
    const ws = workspace("c5a", "testnet-10", T.url);
    const r = await run("NP-3", ["rpc", "info", "--network", "testnet-10", "--json"], ws);
    expect(r.exit, r.brief).toBe(0);
    expect(r.json).toMatchObject({ ok: true, url: T.url, info: { networkId: "testnet-10" } });
    expect(loopbackOnly(r.dialled, T.port)).toBe(true);
  });

  it("NP-3b a node that serves another network than the one declared: refused (NODE_NETWORK_MISMATCH)", async () => {
    const ws = workspace("c5b", "testnet-10", M.url);
    for (const cmd of [["rpc", "info"], ["rpc", "dag"], ["rpc", "health"], ["rpc", "utxos", FUNDED.address], ["rpc", "mempool"]]) {
      const r = await run(`NP-3b-${cmd[1]}`, [...cmd, "--network", "testnet-10", "--json"], ws);
      expect(r.exit, `${cmd.join(" ")}\n${r.brief}`).not.toBe(0);
      expect(r.stdout + r.stderr, cmd.join(" ")).toMatch(/NODE_NETWORK_MISMATCH/);
    }
  });

  it("NP-3c `rpc dag|utxos|mempool|health --network testnet-10` answer from the declared node", async () => {
    const ws = workspace("c5c", "testnet-10", T.url);
    T.utxos.set(FUNDED.address, [{ transactionId: hashOf(0xf0), index: 1, amount: 1_00000000, blockDaaScore: DAA - 100_000, isCoinbase: false }]);
    const dag = await run("NP-3c-dag", ["rpc", "dag", "--network", "testnet-10", "--json"], ws);
    expect(dag.json, dag.brief).toMatchObject({ ok: true, url: T.url });
    const utxos = await run("NP-3c-utxos", ["rpc", "utxos", FUNDED.address, "--network", "testnet-10", "--json"], ws);
    expect(utxos.json?.utxos?.length, utxos.brief).toBe(1);
    const mempool = await run("NP-3c-mempool", ["rpc", "mempool", "--network", "testnet-10", "--json"], ws);
    expect(mempool.exit, mempool.brief).toBe(0);
    const health = await run("NP-3c-health", ["rpc", "health", "--network", "testnet-10", "--json"], ws);
    expect(health.json, health.brief).toMatchObject({ ok: true });
    for (const r of [dag, utxos, mempool, health]) expect(loopbackOnly(r.dialled, T.port), r.name).toBe(true);
  });

  it("NP-3d `rpc health --url <endpoint>` probes that endpoint", async () => {
    const ws = workspace("c5d", "testnet-10", T.url);
    const r = await run("NP-3d", ["rpc", "health", "--url", T.url, "--json"], ws);
    expect(r.json, r.brief).toMatchObject({ ok: true });
    expect(loopbackOnly(r.dialled, T.port)).toBe(true);
  });

  it("NP-3e (contract) without --network or --url, `rpc info` still means the canonical localnet", async () => {
    const ws = workspace("c5e", "testnet-10", T.url);
    const r = await run("NP-3e", ["rpc", "info", "--json"], ws);
    expect(r.json?.url, r.brief).toBe("ws://127.0.0.1:18210");
    expect(r.dialled.some((d) => d.endsWith(`:${T.port}`)), JSON.stringify(r.dialled)).toBe(false);
  });

  it("NP-3f `rpc doctor --endpoints wss://host/path` probes port 443 (the URL's scheme), never 18210", async () => {
    const ws = workspace("c5f", "testnet-10", T.url);
    const r = await run("NP-3f", ["rpc", "doctor", "--endpoints", "wss://127.0.0.2/kaspa/testnet-10/wrpc/json"], ws);
    expect(r.dialled.some((d) => d.endsWith("127.0.0.2:443")), JSON.stringify(r.dialled)).toBe(true);
    expect(r.dialled.some((d) => d.endsWith(":18210")), JSON.stringify(r.dialled)).toBe(false);
  });

  it("NP-3g declaring a network the workspace does not configure: NETWORK_ENDPOINT_REQUIRED, nothing contacted", async () => {
    const ws = workspace("c5g", "testnet-10", T.url);
    const r = await run("NP-3g", ["rpc", "info", "--network", "testnet-11", "--json"], ws);
    expect(r.exit, r.brief).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/NETWORK_ENDPOINT_REQUIRED/);
    expect(r.dialled).toEqual([]);
  });
});

describe("C6 · doctor checks the workspace's network endpoint", () => {
  it("NP-4 testnet-10 workspace: a passing `network endpoint` check names the network the node serves", async () => {
    const ws = workspace("c6a", "testnet-10", T.url);
    const r = await run("NP-4", ["doctor", "--json"], ws);
    const check = (r.json?.checks ?? []).find((c: any) => /network endpoint/i.test(c.name));
    expect(check, r.brief).toBeDefined();
    expect(check.status).toBe("pass");
    expect(check.message).toMatch(/testnet-10/);
  });

  it("NP-4b the endpoint serves another network: the check fails with NODE_NETWORK_MISMATCH", async () => {
    const ws = workspace("c6b", "testnet-10", M.url);
    const r = await run("NP-4b", ["doctor", "--json"], ws);
    const check = (r.json?.checks ?? []).find((c: any) => /network endpoint/i.test(c.name));
    expect(check?.status, r.brief).toBe("fail");
    expect(check.message).toMatch(/NODE_NETWORK_MISMATCH|serves mainnet/);
  });

  it("NP-4c (contract) simnet workspace: no remote endpoint is checked", async () => {
    const ws = workspace("c6c", "simnet");
    const r = await run("NP-4c", ["doctor", "--json"], ws);
    expect((r.json?.checks ?? []).some((c: any) => /network endpoint/i.test(c.name)), r.brief).toBe(false);
  });
});

describe("run · the script's network is the workspace's, checked, never silently simulated", () => {
  it("NP-6 an unknown network name is refused (it used to fall back to the simulator)", async () => {
    const ws = workspace("run1", "testnet-10", T.url);
    fs.writeFileSync(path.join(ws, "s.mjs"), "console.log('NP6_SCRIPT_BODY_EXECUTED');\n");
    const r = await run("NP-6", ["run", "s.mjs", "--network", "testnet-99", "--json"], ws);
    expect(r.exit, r.brief).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/RUN_NETWORK_UNKNOWN/);
    expect(r.stdout + r.stderr).not.toMatch(/NP6_SCRIPT_BODY_EXECUTED/);
  });

  it("NP-6b the wrapper's RPC global checks the node's network identity, and the default network is the workspace's", async () => {
    const { buildRunInjection, resolveRunNetwork } = await import("../src/runners/script-runner.js");
    const config: any = {
      execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
      defaultNetwork: "testnet-10",
      networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: T.url } }
    };
    expect(resolveRunNetwork(config, undefined)).toBe("testnet-10");
    const code = buildRunInjection(config, { network: "testnet-10", accounts: "3", balance: "1", harness: true });
    expect(code).toMatch(/expectedNetworkId:\s*"testnet-10"/);
  });
});

describe("test · the recorded network is the network the scenarios run on", () => {
  it("NP-7 a --network that contradicts the workspace's network is refused (TEST_NETWORK_MISMATCH) before anything runs", async () => {
    const ws = workspace("t1", "simnet");
    const r = await run("NP-7", ["test", "--network", "testnet-10", "--json"], ws);
    expect(r.exit, r.brief).toBe(2);
    expect(r.stdout + r.stderr).toMatch(/TEST_NETWORK_MISMATCH/);
  });
});

describe("ci verify · checks the workspace offline", () => {
  it("NP-5 in a testnet-10 workspace `ci verify` contacts no endpoint (the doctor check is skipped as offline), while `doctor` does", async () => {
    const ws = workspace("ci", "testnet-10", T.url);
    const ci = await run("NP-5-ci", ["ci", "verify"], ws);
    expect(ci.dialled, ci.brief).toEqual([]);
    const doc = await run("NP-5-doctor", ["doctor", "--json"], ws);
    expect(loopbackOnly(doc.dialled, T.port) && doc.dialled.length > 0, doc.brief).toBe(true);
  });
});