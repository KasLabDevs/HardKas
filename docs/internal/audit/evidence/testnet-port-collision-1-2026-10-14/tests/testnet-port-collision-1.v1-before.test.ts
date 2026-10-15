import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { cliDist, childEnv, repoRoot } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

// -----------------------------------------------------------------------------
// TESTNET-PORT-COLLISION-1 (2026-10-14) · BEFORE (investigation; no fix).
// L1-REALITY-1 E2 V2: a workspace that declares its own testnet-10 node (`kind: "kaspa-node"`) without `rpcUrl` ends on
// ws://127.0.0.1:18210 — the canonical HardKAS localnet's port (a SIMNET node), because 18210 is also the SDK's default
// JSON-wRPC port for testnets. This file measures, per path, the exact address each one dials.
//   * Two FAKE nodes on loopback only: S on 127.0.0.1:18210 says simnet (what the canonical localnet would be); T on a
//     free port says testnet-10 (the operator's own testnet node). Nothing else runs: the port 18210 is free beforehand.
//   * Every path runs in its OWN process under the hermetic preload with its OWN log: every connection attempt it makes
//     is recorded (loopback allowed, anything else refused) — TN10 and the internet are unreachable.
//   * NNI refusing S (it says simnet) is NOT a correct endpoint resolution: the invariant measured is that a testnet-10
//     path never connects to 127.0.0.1:18210 at all.
// Each case writes what it saw to $HARDKAS_TPC_TRACE_DIR.
// -----------------------------------------------------------------------------

const CANONICAL_PORT = 18210;
let kaspa: any;
const hashOf = (n: number) => n.toString(16).padStart(64, "0");
function spkHex(address: string): string {
  const spk = kaspa.payToAddressScript(address);
  const script = typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex");
  return spk.version.toString(16).padStart(4, "0") + script;
}

type Fake = { url: string; port: number; label: string; connections: number; methods: string[]; close(): Promise<void> };
async function startFake(label: string, network: string, port = 0): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  await new Promise<void>((r, j) => {
    server.on("listening", () => r());
    server.on("error", j);
  });
  const fake: Fake = { url: "", port: 0, label, connections: 0, methods: [], close: async () => {} };
  const DAA = 50_000_000;
  server.on("connection", (socket) => {
    fake.connections++;
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
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":1,"message":${JSON.stringify(message)}}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: network, hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getInfo":
          return ok({ p2pId: label, mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({ network, blockCount: 10, headerCount: 10, tipHashes: [hashOf(1)], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [hashOf(1)], pruningPointHash: hashOf(2), virtualDaaScore: DAA, sink: hashOf(1) });
        case "getSinkBlueScore":
          return ok({ blueScore: DAA });
        case "getFeeEstimate":
          return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: 100_00000000 })) });
        case "getUtxosByAddresses":
          return ok({
            entries: (params?.addresses ?? []).map((address: string, i: number) => ({
              address,
              outpoint: { transactionId: hashOf(0xf00 + i), index: 0 },
              utxoEntry: { amount: 100_00000000, scriptPublicKey: spkHex(address), blockDaaScore: DAA - 100_000, isCoinbase: false }
            }))
          });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: [] });
        case "getMempoolEntry":
          return err("transaction not found in mempool");
        case "getVirtualChainFromBlockV2":
        case "getVirtualChainFromBlock":
          return ok({ removedChainBlockHashes: [], addedChainBlockHashes: [], acceptedTransactionIds: [], chainBlockAcceptedTransactions: [] });
        case "submitTransaction":
          return err("fake node: submissions refused"); // nothing is ever broadcast
        default:
          return err(`fake ${label} does not implement ${method}`);
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

const PW = "tpc-test-password-only";
const traceDir = process.env.HARDKAS_TPC_TRACE_DIR;
function trace(name: string, data: unknown) {
  if (!traceDir) return;
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(path.join(traceDir, `${name}.json`), JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}

const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tpc-netlogs-"));
/** One process (the built CLI, or node running a script) with its OWN hermetic log; every address it tried. */
async function inProcess(name: string, argv: string[], cwd: string) {
  const log = path.join(logs, `${name}.net.log`);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, argv, { cwd, env: childEnv({ HK_TPC_PW: PW, HARDKAS_HERMETIC_LOG: log }) });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 120_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
  const attempts = fs.existsSync(log)
    ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split("\t")).map(([, kind, target]) => `${kind} ${target}`)
    : [];
  let doc: any;
  for (const chunk of r.stdout.split(/\r?\n(?=[{\[])/)) {
    try {
      const d = JSON.parse(chunk.trim());
      if (d && typeof d === "object" && !Array.isArray(d)) doc = doc ?? d;
    } catch {
      /* not a document */
    }
  }
  const all = `${r.stdout}\n${r.stderr}`;
  return {
    name,
    exit: r.status,
    code: doc?.code ?? doc?.error?.code ?? (/"code"\s*:\s*"([A-Z_]+)"/.exec(all)?.[1] ?? null),
    message: String(doc?.message ?? doc?.error?.message ?? "").slice(0, 240),
    // distinct addresses, in first-seen order (the same address is dialled once per connection)
    dialled: [...new Set(attempts)],
    brief: `exit ${r.status}\n${r.stdout.slice(0, 900)}\n${r.stderr.slice(0, 600)}`
  };
}
const cli = (name: string, args: string[], cwd: string) => inProcess(name, [cliDist, ...args], cwd);
const sdkDist = pathToFileURL(path.join(repoRoot, "packages", "sdk", "dist", "index.js")).href;
/** An SDK call in its own process: `body` runs with `hk` open on testnet-10 (or `network`). */
function sdk(name: string, cwd: string, body: string, network = "testnet-10") {
  const script = path.join(logs, `${name}.mjs`);
  fs.writeFileSync(
    script,
    `const { Hardkas } = await import(${JSON.stringify(sdkDist)});\n` +
      `let out = {};\n` +
      `try {\n  const hk = await Hardkas.open({ cwd: ${JSON.stringify(cwd)}, network: ${JSON.stringify(network)}, policy: { allowPublic: true } });\n` +
      `  try { ${body} } finally { await hk.close(); }\n  out.ok = true;\n` +
      `} catch (e) { out = { ok: false, code: e?.code ?? null, message: String(e?.message ?? e).slice(0, 240) }; }\n` +
      `console.log(JSON.stringify(out));\n`
  );
  return inProcess(name, [script], cwd);
}

const config = (networks: Record<string, unknown>, executionNetwork = "testnet-10") =>
  `export default ${JSON.stringify({
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: executionNetwork } } },
    network: { allowPublic: true },
    experimental: true,
    networks
  })};\n`;

let template: string;
const made: string[] = [logs];
function workspace(cfg: string, from?: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tpc-"));
  made.push(ws);
  fs.cpSync(from ?? template, ws, { recursive: true });
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), cfg);
  return ws;
}
let alice = "";
let carol = "";

let S: Fake;
let T: Fake;
let signed: { file: string; txId: string; ws: string } | undefined;

beforeAll(async () => {
  const coreMod: any = await import("@hardkas/core");
  kaspa = coreMod.loadManagedKaspaWasmSync();
  S = await startFake("S(:18210, says simnet)", "simnet", CANONICAL_PORT);
  T = await startFake("T(own testnet-10)", "testnet-10");
  template = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tpc-template-"));
  made.push(template);
  fs.mkdirSync(path.join(template, ".hardkas"));
  fs.writeFileSync(
    path.join(template, "hardkas.config.ts"),
    'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } }, network: { allowPublic: false } };\n'
  );
  for (const [name, network] of [["alice", "testnet-10"], ["bob", "testnet-10"], ["carol", "simnet"]] as const) {
    const r = await cli(`setup-${name}`, ["accounts", "real", "generate", "--name", name, "--network", network, "--password-env", "HK_TPC_PW", "--json"], template);
    expect(r.exit, r.brief).toBe(0);
  }
  alice = "alice";
  carol = "carol";
  // a signed testnet-10 transaction, made against T through an EXPLICIT endpoint (the store is then reused)
  const R = workspace(config({ "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: T.url } }));
  const made1 = await sdk(
    "setup-sign",
    R,
    `const plan = await hk.tx.plan({ from: "alice", to: "bob", amount: "1" }); const s = await hk.tx.sign(plan, { account: "alice", keystorePassword: process.env.HK_TPC_PW }); out.txId = s.txId;`
  );
  const signedDir = path.join(R, ".hardkas", "artifacts", "signed");
  const file = fs.existsSync(signedDir) ? fs.readdirSync(signedDir).find((f) => f.startsWith("signedTx-")) : undefined;
  const txId = /"txId"\s*:\s*"([0-9a-f]{64})"/.exec(fs.readFileSync(path.join(R, ".hardkas", "artifacts", "signed", file ?? ""), "utf8"))?.[1];
  expect(file && txId, made1.brief).toBeTruthy();
  signed = { file: path.join(".hardkas", "artifacts", "signed", file!), txId: txId!, ws: R };
});
afterAll(async () => {
  await S?.close();
  await T?.close();
  for (const ws of made) fs.rmSync(ws, { recursive: true, force: true });
});

/** Every path that resolves an endpoint for testnet-10, run against workspace `ws`. */
async function testnetPaths(prefix: string, ws: string) {
  const sw = signed!;
  return [
    await cli(`${prefix}-cli-accounts-balance`, ["accounts", "balance", alice, "--network", "testnet-10", "--json"], ws),
    await cli(`${prefix}-cli-tx-plan`, ["tx", "plan", "--network", "testnet-10", "--from", "alice", "--to", "bob", "--amount", "1", "--json"], ws),
    await cli(`${prefix}-cli-tx-send`, ["tx", "send", path.join(ws, sw.file), "--yes", "--json"], ws),
    await cli(`${prefix}-cli-tx-status`, ["tx", "status", sw.txId, "--json"], ws),
    await cli(`${prefix}-cli-tx-wait`, ["tx", "wait", sw.txId, "--until", "accepted", "--timeout", "3", "--json"], ws),
    await cli(`${prefix}-cli-accounts-consolidate`, ["accounts", "consolidate", "alice", "--network", "testnet-10", "--json"], ws),
    await sdk(`${prefix}-sdk-rpc`, ws, `out.dag = (await hk.rpc.getBlockDagInfo())?.network ?? null;`),
    await sdk(`${prefix}-sdk-tx-plan`, ws, `await hk.tx.plan({ from: "alice", to: "bob", amount: "1" });`),
    await sdk(`${prefix}-sdk-tx-observe`, ws, `await hk.tx.observe(${JSON.stringify(sw.txId)}, { maxBatches: 1 });`)
  ];
}
const dialledCanonical = (r: { dialled: string[] }) => r.dialled.some((d) => d.endsWith(`127.0.0.1:${CANONICAL_PORT}`) || d.endsWith(`localhost:${CANONICAL_PORT}`));
const summary = (rs: Awaited<ReturnType<typeof testnetPaths>>) =>
  rs.map((r) => ({ path: r.name, exit: r.exit, code: r.code, dialled: r.dialled, message: r.message, output: r.brief.slice(0, 700) }));

describe("TESTNET-PORT-COLLISION-1 · BEFORE", () => {
  it("TPC-1 testnet-10 declared as `kaspa-node` WITHOUT rpcUrl: no testnet path may dial 127.0.0.1:18210 (the canonical simnet localnet's port)", async () => {
    // the same store (keys, the signed transaction), under the reviewer's case
    const K = workspace(config({ "testnet-10": { kind: "kaspa-node", network: "testnet-10" } }), signed!.ws);
    const sBefore = { connections: S.connections, methods: S.methods.length };
    const rs = await testnetPaths("K", K);
    const seen = {
      paths: summary(rs),
      canonicalPortDialledBy: rs.filter(dialledCanonical).map((r) => r.name),
      fakeS: { connections: S.connections - sBefore.connections, methods: S.methods.slice(sBefore.methods) },
      submitTransactionAtS: S.methods.slice(sBefore.methods).filter((m) => m === "submitTransaction").length
    };
    trace("TPC-1", seen);
    // NNI refusing S afterwards does not make the resolution right: the connection itself must not happen
    expect(seen.canonicalPortDialledBy, JSON.stringify(seen, null, 1)).toEqual([]);
    expect(seen.fakeS.connections, JSON.stringify(seen, null, 1)).toBe(0);
  });

  it("TPC-2 control: testnet-10 as `kaspa-rpc` with an explicit rpcUrl (the own node T): every path dials T and only T", async () => {
    const R = workspace(config({ "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: T.url } }), signed!.ws);
    const rs = await testnetPaths("R", R);
    const target = `LOOPBACK_CONNECT 127.0.0.1:${T.port}`;
    const seen = { paths: summary(rs), notOnlyT: rs.filter((r) => r.dialled.some((d) => d !== target)).map((r) => r.name) };
    trace("TPC-2", seen);
    expect(rs.filter(dialledCanonical).map((r) => r.name), JSON.stringify(seen, null, 1)).toEqual([]);
    expect(seen.notOnlyT, JSON.stringify(seen, null, 1)).toEqual([]);
  });

  it("TPC-3 characterization: testnet-10 with NO networks entry takes the built-in default — a third-party public host (refused here by the hermetic preload)", async () => {
    const D = workspace(config({}), signed!.ws);
    const rs = [
      await cli("D-cli-accounts-balance", ["accounts", "balance", alice, "--network", "testnet-10", "--json"], D),
      await cli("D-cli-tx-plan", ["tx", "plan", "--network", "testnet-10", "--from", "alice", "--to", "bob", "--amount", "1", "--json"], D),
      await sdk("D-sdk-rpc", D, `out.dag = (await hk.rpc.getBlockDagInfo())?.network ?? null;`)
    ];
    const seen = { paths: rs.map((r) => ({ path: r.name, exit: r.exit, code: r.code, dialled: r.dialled, message: r.message })) };
    trace("TPC-3", seen);
    for (const r of rs) {
      expect(r.dialled.some((d) => /^REFUSED_(DNS|CONNECT) tn10\.kaspa\.stream/.test(d)), JSON.stringify(seen, null, 1)).toBe(true);
      expect(dialledCanonical(r)).toBe(false);
    }
  });

  it("TPC-4 control: simnet declared as `kaspa-node` without rpcUrl keeps its legitimate default — the canonical localnet (S on :18210)", async () => {
    const SN = workspace(config({ simnet: { kind: "kaspa-node", network: "simnet" } }, "simnet"), signed!.ws);
    const rs = [
      await cli("SN-cli-accounts-balance", ["accounts", "balance", carol, "--network", "simnet", "--json"], SN),
      await sdk("SN-sdk-rpc", SN, `out.dag = (await hk.rpc.getBlockDagInfo())?.network ?? null;`, "simnet")
    ];
    const seen = { paths: rs.map((r) => ({ path: r.name, exit: r.exit, code: r.code, dialled: r.dialled, message: r.message })) };
    trace("TPC-4", seen);
    for (const r of rs) {
      expect(r.exit, r.brief).toBe(0);
      expect(dialledCanonical(r), JSON.stringify(seen, null, 1)).toBe(true);
    }
  });
});
