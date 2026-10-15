import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { cliDist, repoRoot } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

// -----------------------------------------------------------------------------
// TQ1-SCRIPT-BROKEN-1 (2026-10-15). `scripts/testnet-qualification.mjs --live` against FAKE nodes on loopback only.
// Contract (review 2026-10-15):
//   * the script runs to a guarded submission (no ReferenceError, no `networkProfile` lookup, a keystore password
//     from an env var it names — never printed);
//   * ONE endpoint authority: the workspace's endpoint for the network (TESTNET-PORT-COLLISION-1's resolveNodeEndpoint)
//     must be HARDKAS_TQ_ENDPOINT, checked BEFORE the SDK opens — a mismatch or an undeclared endpoint is a typed
//     configuration refusal (exit 4) with zero connections;
//   * `allowPublic` only for a testnet qualification; configuration errors are typed (exit 4), never a stack trace;
//   * the receipt records the HardKAS version of the repository;
//   * D7: the receipt has an explicit submission-attempt record — `not_attempted` (attempts 0) when
//     `submitTransaction` was never invoked; `accepted` / `rejected` / `outcome_unknown` (attempts 1) when it was.
//     An unclassified node error after the call is `outcome_unknown`, never a missing record, never "0 submits".
// Fakes: T (the declared node, says testnet-10, holds the funding outpoint), U (another testnet-10 node), S on 18210
// (says simnet). Every fake refuses `submitTransaction` — nothing is broadcast anywhere. Each run has its own hermetic
// log of every address it tried. Traces in $HARDKAS_TQ1_TRACE_DIR.
// -----------------------------------------------------------------------------

const SCRIPT = path.join(repoRoot, "scripts", "testnet-qualification.mjs");
const PW = "tq1-test-password-only";
const PW_VAR = "HK_TQ1_TEST_PW";
const CLI_VERSION = JSON.parse(fs.readFileSync(path.join(repoRoot, "packages", "cli", "package.json"), "utf8")).version as string;

let kaspa: any;
const hashOf = (n: number) => n.toString(16).padStart(64, "0");
function spkHex(address: string): string {
  const spk = kaspa.payToAddressScript(address);
  const script = typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex");
  return spk.version.toString(16).padStart(4, "0") + script;
}

const funding = { address: "", txid: hashOf(0xf00d), index: 0, amount: 50_00000000 };
type Fake = { url: string; port: number; connections: number; methods: string[]; close(): Promise<void> };
async function startFake(label: string, network: string, opts: { port?: number; submitError?: string } = {}): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: opts.port ?? 0 });
  await new Promise<void>((r, j) => {
    server.on("listening", () => r());
    server.on("error", j);
  });
  const fake: Fake = { url: "", port: 0, connections: 0, methods: [], close: async () => {} };
  const DAA = 90_000_000;
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
        case "getUtxosByAddresses":
          return ok({
            entries: (params?.addresses ?? [])
              .filter((a: string) => a === funding.address)
              .map((address: string) => ({
                address,
                outpoint: { transactionId: funding.txid, index: funding.index },
                utxoEntry: { amount: funding.amount, scriptPublicKey: spkHex(address), blockDaaScore: DAA - 100_000, isCoinbase: false }
              }))
          });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: address === funding.address ? funding.amount : 0 })) });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: [] });
        case "getMempoolEntry":
          return err("transaction not found in mempool");
        case "submitTransaction":
          return err(opts.submitError ?? "fake node: submissions refused"); // nothing is ever broadcast
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

const traceDir = process.env.HARDKAS_TQ1_TRACE_DIR;
function trace(name: string, data: unknown) {
  if (!traceDir) return;
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(path.join(traceDir, `${name}.json`), JSON.stringify(data, null, 2));
}
const made: string[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tq1-netlogs-"));
made.push(logs);

/** One process with its OWN hermetic log; every address it tried. HARDKAS_TQ_* come only from `env`. */
async function run(name: string, argv: string[], cwd: string, env: Record<string, string> = {}) {
  const log = path.join(logs, `${name}.net.log`);
  // HERMETIC-CHILD-PRELOAD-1: the child loads the hermetic preload itself, whatever runs this file (CI included)
  const base = hermeticChildEnv(log, { [PW_VAR]: PW });
  for (const k of Object.keys(base)) if (k.startsWith("HARDKAS_TQ_")) delete base[k];
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, argv, { cwd, env: { ...base, ...env } });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 200_000);
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
  return { name, exit: r.status, stdout: r.stdout, stderr: r.stderr, dialled, brief: `exit ${r.status}\n${r.stdout.slice(-1500)}\n${r.stderr.slice(0, 1500)}` };
}

const cfg = (obj: unknown) => `export default ${JSON.stringify(obj, null, 2)};\n`;
const full = (networks: Record<string, unknown>) => ({
  execution: { default: "tn", targets: { tn: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
  network: { allowPublic: true },
  experimental: true,
  networks
});
let template = "";
function workspace(label: string, config: unknown): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-tq1-${label}-`));
  made.push(ws);
  fs.cpSync(template, ws, { recursive: true });
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), cfg(config));
  return ws;
}
let dest = "";
function tqEnv(endpoint: string, ws: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    HARDKAS_TQ_ENDPOINT: endpoint,
    HARDKAS_TQ_ENDPOINT_CLASS: "wrpc",
    HARDKAS_TQ_WORKSPACE: ws,
    HARDKAS_TQ_FUNDING_ACCOUNT: "funder",
    HARDKAS_TQ_FUNDING_ADDRESS: funding.address,
    HARDKAS_TQ_FUNDING_TXID: funding.txid,
    HARDKAS_TQ_FUNDING_INDEX: String(funding.index),
    HARDKAS_TQ_FUNDING_MIN_SOMPI: String(funding.amount),
    HARDKAS_TQ_DEST_ADDRESS: dest,
    HARDKAS_TQ_AMOUNT_SOMPI: "100000000",
    HARDKAS_TQ_RECEIPTS_DIR: path.join(ws, ".hardkas", "testnet-qualification"),
    HARDKAS_TQ_KEYSTORE_PASSWORD_ENV: PW_VAR,
    ...extra
  };
}
const qualify = (name: string, ws: string, env: Record<string, string>, network = "testnet-10") =>
  run(name, [SCRIPT, "--live", "--expected-network", network], ws, env);
function receiptOf(ws: string): { file: string; text: string; json: any } | undefined {
  const dir = path.join(ws, ".hardkas", "testnet-qualification", "raw");
  const f = fs.existsSync(dir) ? fs.readdirSync(dir).find((n) => n.endsWith(".json")) : undefined;
  if (!f) return undefined;
  const text = fs.readFileSync(path.join(dir, f), "utf8");
  return { file: path.join(dir, f), text, json: JSON.parse(text) };
}
const NO_STACK = /^\s+at .+\(.*:\d+:\d+\)$|^\s+at file:\/\//m;

let S: Fake;
let T: Fake;
let U: Fake;
let R: Fake;
const count = (f: Fake, m: string, from: number) => f.methods.slice(from).filter((x) => x === m).length;

beforeAll(async () => {
  // nothing below may run unless every child's connection attempts are recorded (and non-loopback ones refused)
  assertHermeticPreloadActive();
  const coreMod: any = await import("@hardkas/core");
  kaspa = coreMod.loadManagedKaspaWasmSync();
  S = await startFake("S(:18210 simnet)", "simnet", { port: 18210 });
  T = await startFake("T(declared, testnet-10)", "testnet-10");
  U = await startFake("U(other, testnet-10)", "testnet-10");
  // R rejects explicitly, with a consensus message
  R = await startFake("R(rejects, testnet-10)", "testnet-10", { submitError: "transaction rejected: invalid signature (fake)" });
  template = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tq1-template-"));
  made.push(template);
  fs.mkdirSync(path.join(template, ".hardkas"));
  fs.writeFileSync(path.join(template, "hardkas.config.ts"), cfg({ execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } } }));
  const gen = await run("setup-generate", [cliDist, "accounts", "real", "generate", "--name", "funder", "--network", "testnet-10", "--password-env", PW_VAR, "--json"], template);
  funding.address = /kaspatest:[0-9a-z]+/.exec(gen.stdout)?.[0] ?? "";
  expect(funding.address, gen.brief).not.toBe("");
  dest = new kaspa.PrivateKey("55".repeat(32)).toAddress("testnet-10").toString();
});
afterAll(async () => {
  await S?.close();
  await T?.close();
  await U?.close();
  await R?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("TQ1-SCRIPT-BROKEN-1 · the script reaches one guarded submission and records it", () => {
  it("TQ1-1 coherent workspace (rpcUrl = HARDKAS_TQ_ENDPOINT = T): one submitTransaction at T; the unclassified refusal is recorded as attempts 1 / outcome_unknown; the password never appears; the version is the repository's", async () => {
    const ws = workspace("V1", full({ "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: T.url } }));
    const from = T.methods.length;
    const r = await qualify("TQ1-1", ws, tqEnv(T.url, ws));
    const rec = receiptOf(ws);
    const seen = { exit: r.exit, dialled: r.dialled, submitsAtT: count(T, "submitTransaction", from), receipt: rec?.json, out: r.brief };
    trace("TQ1-1", seen);
    expect(r.stderr, r.brief).not.toMatch(/ReferenceError|configuredDaaDelta|NAMESPACE_REQUIRED|KEYSTORE_PASSWORD_REQUIRED/);
    expect(seen.submitsAtT, r.brief).toBe(1);
    expect(r.dialled.every((d) => d === `LOOPBACK_CONNECT 127.0.0.1:${T.port}`), JSON.stringify(r.dialled)).toBe(true);
    expect(rec, r.brief).toBeTruthy();
    expect(rec!.json.schemaVersion).toBe(3); // TN10-CONFIRMATION-FIX-1: receipts are v3
    expect(rec!.json.outcome).toBe("UNRESOLVED");
    expect(rec!.json.evidence.submissionAttempts).toEqual([
      expect.objectContaining({ attempts: 1, outcome: "outcome_unknown", stage: "submit" })
    ]);
    expect(rec!.json.evidence.submissions?.[0]?.state).toBe("UNRESOLVED");
    expect(r.stdout).toMatch(/submit calls\s*:\s*1\b/);
    expect(r.stdout).toMatch(/submission outcome\s*:\s*outcome_unknown/);
    expect(rec!.json.toolchain.hardkas.version).toBe(CLI_VERSION);
    for (const text of [r.stdout, r.stderr, rec!.text]) expect(text.includes(PW), "the keystore password is never printed or recorded").toBe(false);
  });

  it("TQ1-1r a node that rejects explicitly: attempts 1 / rejected, FAIL (never retried)", async () => {
    const ws = workspace("V1r", full({ "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: R.url } }));
    const from = R.methods.length;
    const r = await qualify("TQ1-1r", ws, tqEnv(R.url, ws));
    const rec = receiptOf(ws);
    trace("TQ1-1r", { exit: r.exit, dialled: r.dialled, receipt: rec?.json, out: r.brief });
    expect(count(R, "submitTransaction", from), r.brief).toBe(1);
    expect(r.exit, r.brief).toBe(3);
    expect(rec?.json.evidence.submissionAttempts, r.brief).toEqual([expect.objectContaining({ attempts: 1, outcome: "rejected" })]);
  });

  it("TQ1-5 minimal workspace (only the network entry, no allowPublic/experimental): the qualification still reaches its one submission", async () => {
    const ws = workspace("V5", { networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: T.url } } });
    const from = T.methods.length;
    const r = await qualify("TQ1-5", ws, tqEnv(T.url, ws));
    trace("TQ1-5", { exit: r.exit, dialled: r.dialled, out: r.brief });
    expect(count(T, "submitTransaction", from), r.brief).toBe(1);
    expect(receiptOf(ws)?.json.evidence.submissionAttempts?.[0]?.attempts, r.brief).toBe(1);
  });

  it("TQ1-7b no keystore password given for an encrypted account: FAIL at plan-and-sign, recorded as attempts 0 / not_attempted, nothing submitted", async () => {
    const ws = workspace("V7b", full({ "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: T.url } }));
    const from = T.methods.length;
    const env = tqEnv(T.url, ws);
    delete env.HARDKAS_TQ_KEYSTORE_PASSWORD_ENV;
    const r = await qualify("TQ1-7b", ws, env);
    const rec = receiptOf(ws);
    trace("TQ1-7b", { exit: r.exit, receipt: rec?.json, out: r.brief });
    expect(count(T, "submitTransaction", from), r.brief).toBe(0);
    expect(r.exit, r.brief).toBe(3);
    expect(r.stdout, r.brief).toMatch(/KEYSTORE_PASSWORD_REQUIRED/);
    expect(rec?.json.evidence.submissionAttempts, r.brief).toEqual([
      expect.objectContaining({ attempts: 0, outcome: "not_attempted", stage: "plan-and-sign" })
    ]);
    expect(r.stdout).toMatch(/submit calls\s*:\s*0\b/);
  });
});

describe("TQ1-SCRIPT-BROKEN-1 · typed refusals before any connection", () => {
  const refusal = async (name: string, ws: string, env: Record<string, string>, code: RegExp, network = "testnet-10") => {
    const before = { T: T.connections, U: U.connections, S: S.connections };
    const r = await qualify(name, ws, env, network);
    const seen = { exit: r.exit, dialled: r.dialled, fakes: { T: T.connections - before.T, U: U.connections - before.U, S: S.connections - before.S }, out: r.brief };
    trace(name, seen);
    expect(r.exit, r.brief).toBe(4);
    expect(r.stderr, r.brief).toMatch(code);
    expect(r.stderr, `${name}: a configuration refusal is typed, not a stack trace`).not.toMatch(NO_STACK);
    expect(r.dialled, r.brief).toEqual([]);
    expect(seen.fakes, r.brief).toEqual({ T: 0, U: 0, S: 0 });
    expect(receiptOf(ws), r.brief).toBeUndefined();
  };

  it("TQ1-2 the workspace declares U, the operator declares T: ENDPOINT_DECLARATION_MISMATCH before the SDK opens", async () => {
    const ws = workspace("V2", full({ "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: U.url } }));
    await refusal("TQ1-2", ws, tqEnv(T.url, ws), /ENDPOINT_DECLARATION_MISMATCH/);
  });

  it("TQ1-3 no testnet-10 entry: NETWORK_ENDPOINT_REQUIRED (no built-in public host)", async () => {
    const ws = workspace("V3", full({}));
    await refusal("TQ1-3", ws, tqEnv(T.url, ws), /NETWORK_ENDPOINT_REQUIRED/);
  });

  it("TQ1-4 own node as `kaspa-node` without rpcUrl: NETWORK_ENDPOINT_REQUIRED, never 127.0.0.1:18210", async () => {
    const ws = workspace("V4", full({ "testnet-10": { kind: "kaspa-node", network: "testnet-10" } }));
    await refusal("TQ1-4", ws, tqEnv(T.url, ws), /NETWORK_ENDPOINT_REQUIRED/);
  });

  it("TQ1-6 an invalid workspace config (allowPublic without experimental): CONFIGURATION_REFUSED, typed", async () => {
    const ws = workspace("V6", { ...full({ "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: T.url } }), experimental: undefined });
    await refusal("TQ1-6", ws, tqEnv(T.url, ws), /CONFIGURATION_REFUSED/);
  });

  it("TQ1-7a HARDKAS_TQ_KEYSTORE_PASSWORD_ENV names an unset variable: refused before any connection, the name shown, no value", async () => {
    const ws = workspace("V7a", full({ "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: T.url } }));
    await refusal("TQ1-7a", ws, tqEnv(T.url, ws, { HARDKAS_TQ_KEYSTORE_PASSWORD_ENV: "HK_TQ1_UNSET_VARIABLE" }), /HK_TQ1_UNSET_VARIABLE/);
  });

  it("TQ1-8 mainnet is refused (allowPublic is never granted outside a testnet qualification)", async () => {
    const ws = workspace("V8", full({ mainnet: { kind: "kaspa-rpc", network: "mainnet", rpcUrl: T.url } }));
    const r = await qualify("TQ1-8", ws, tqEnv(T.url, ws), "mainnet");
    trace("TQ1-8", { exit: r.exit, dialled: r.dialled, out: r.brief });
    expect(r.exit, r.brief).toBe(4);
    expect(r.dialled).toEqual([]);
  });
});
