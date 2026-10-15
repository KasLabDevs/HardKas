import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { cliDist, repoRoot } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

// -----------------------------------------------------------------------------
// TESTNET-PORT-COLLISION-1 (2026-10-14). Contract (review D-TPC-1/2/4): a public network (testnet-*, mainnet) gets an
// endpoint only from the caller (`--url`) or from the user's own declaration; with neither, every client path refuses
// typed NETWORK_ENDPOINT_REQUIRED before any connection — never the canonical localnet, never a built-in public host.
// Local networks keep their defaults; NNI still verifies whatever endpoint is used.
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
    // HERMETIC-CHILD-PRELOAD-1: the child loads the hermetic preload itself, whatever runs this file (CI included)
    const child = spawn(process.execPath, argv, { cwd, env: hermeticChildEnv(log, { HK_TPC_PW: PW }) });
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
  // nothing below may run unless every child's connection attempts are recorded (and non-loopback ones refused)
  assertHermeticPreloadActive();
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

/**
 * The contract for a public network with no endpoint the user chose (review 2026-10-14, D-TPC-1/2/4): every client
 * path refuses typed NETWORK_ENDPOINT_REQUIRED before ANY connection. `tx status` keeps its observation contract (exit 0,
 * INSUFFICIENT_EVIDENCE) and names the refusal as the reason no look was taken.
 */
function expectEndpointRequired(rs: Array<{ name: string; exit: number | null; code: string | null; dialled: string[]; brief: string }>, why: string) {
  for (const r of rs) {
    expect(r.dialled, `${r.name}: ${why}`).toEqual([]);
    if (r.name.endsWith("cli-tx-status")) {
      expect(r.exit, `${r.name}: ${r.brief}`).toBe(0);
      expect(r.brief, r.name).toMatch(/INSUFFICIENT_EVIDENCE/);
      expect(r.brief, r.name).toMatch(/NETWORK_ENDPOINT_REQUIRED/);
    } else {
      expect(r.code, `${r.name}: ${r.brief}`).toBe("NETWORK_ENDPOINT_REQUIRED");
      if (r.name.includes("-cli-")) expect(r.exit, `${r.name}: ${r.brief}`).not.toBe(0);
    }
  }
}

let mainA = "";
let mainB = "";
beforeAll(() => {
  mainA = new kaspa.PrivateKey("11".repeat(32)).toAddress("mainnet").toString();
  mainB = new kaspa.PrivateKey("22".repeat(32)).toAddress("mainnet").toString();
});

describe("TESTNET-PORT-COLLISION-1 · a public network never gets an implicit endpoint", () => {
  it("TPC-1 testnet-10 declared as `kaspa-node` WITHOUT rpcUrl: NETWORK_ENDPOINT_REQUIRED on every path, zero connections (never 127.0.0.1:18210)", async () => {
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
    expectEndpointRequired(rs, JSON.stringify(seen, null, 1));
  });

  it("TPC-3 testnet-10 with NO networks entry: the built-in public endpoint is not used — NETWORK_ENDPOINT_REQUIRED, zero connections", async () => {
    const D = workspace(config({}), signed!.ws);
    const rs = await testnetPaths("D", D);
    const seen = { paths: summary(rs) };
    trace("TPC-3", seen);
    expectEndpointRequired(rs, JSON.stringify(seen, null, 1));
  });

  it("TPC-5 mainnet without an endpoint (as `kaspa-node`, and with no entry): NETWORK_ENDPOINT_REQUIRED, zero connections", async () => {
    const rs = [];
    for (const [label, networks] of [
      ["MK", { mainnet: { kind: "kaspa-node", network: "mainnet" } }],
      ["MD", {}]
    ] as const) {
      const M = workspace(config(networks as Record<string, unknown>, "mainnet"));
      rs.push(
        await cli(`${label}-cli-accounts-balance`, ["accounts", "balance", mainA, "--network", "mainnet", "--json"], M),
        await cli(`${label}-cli-tx-plan`, ["tx", "plan", "--network", "mainnet", "--from", mainA, "--to", mainB, "--amount", "1", "--json"], M),
        await sdk(`${label}-sdk-rpc`, M, `out.dag = (await hk.rpc.getBlockDagInfo())?.network ?? null;`, "mainnet")
      );
    }
    const seen = { paths: summary(rs) };
    trace("TPC-5", seen);
    expectEndpointRequired(rs, JSON.stringify(seen, null, 1));
  });

  it("TPC-7 an explicit endpoint is never silently replaced: `--url` T on the K workspace dials T only; a declared endpoint that is down fails on THAT endpoint, never on a fallback", async () => {
    const K = workspace(config({ "testnet-10": { kind: "kaspa-node", network: "testnet-10" } }), signed!.ws);
    const viaUrl = [
      await cli("KU-cli-accounts-balance", ["accounts", "balance", alice, "--network", "testnet-10", "--url", T.url, "--json"], K),
      await cli("KU-cli-tx-plan", ["tx", "plan", "--network", "testnet-10", "--from", "alice", "--to", "bob", "--amount", "1", "--url", T.url, "--json"], K),
      await cli("KU-cli-tx-send", ["tx", "send", path.join(K, signed!.file), "--url", T.url, "--yes", "--json"], K)
    ];
    const deadFake = await startFake("dead", "testnet-10");
    const dead = deadFake.url;
    await deadFake.close(); // a declared endpoint where nothing listens any more
    const Dd = workspace(config({ "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: dead } }), signed!.ws);
    const viaDead = [
      await cli("DD-cli-accounts-balance", ["accounts", "balance", alice, "--network", "testnet-10", "--json"], Dd),
      await cli("DD-cli-tx-plan", ["tx", "plan", "--network", "testnet-10", "--from", "alice", "--to", "bob", "--amount", "1", "--json"], Dd),
      await sdk("DD-sdk-rpc", Dd, `out.dag = (await hk.rpc.getBlockDagInfo())?.network ?? null;`)
    ];
    const seen = { viaUrl: summary(viaUrl), viaDead: summary(viaDead), T: T.url, dead };
    trace("TPC-7", seen);
    for (const r of viaUrl) expect(r.dialled, `${r.name}: ${r.brief}`).toEqual([`LOOPBACK_CONNECT 127.0.0.1:${T.port}`]);
    for (const r of viaDead) {
      expect(r.dialled.length, `${r.name}: ${r.brief}`).toBeGreaterThan(0);
      expect(r.dialled.every((d) => d === `LOOPBACK_CONNECT ${dead.replace("ws://", "")}`), `${r.name}: ${JSON.stringify(r.dialled)}`).toBe(true);
    }
  });
});

// Review 2026-10-14 (additional qualification): the distinction "endpoint the user chose" vs "built-in default" must not
// depend on object identity — it must survive loading, validation, composition and reloading of the configuration.
const OLD_BUILTIN_TN10 = "wss://tn10.kaspa.stream:443";
const configDist = pathToFileURL(path.join(repoRoot, "packages", "config", "dist", "index.js")).href;
const dialledOnly = (r: { dialled: string[] }, host: string) =>
  r.dialled.length > 0 && r.dialled.every((d) => new RegExp(`^REFUSED_(CONNECT|DNS) ${host.replace(/\./g, "\\.")}(:\\d+)?$`).test(d));

describe("TESTNET-PORT-COLLISION-1 · the user's choice survives (review 2026-10-14)", () => {
  it("TPC-8a the user declares exactly the URL the built-in once held (wss://tn10.kaspa.stream:443): accepted as declared — every path dials that host (refused by the hermetic preload), never NETWORK_ENDPOINT_REQUIRED, never a fallback", async () => {
    const rs = [];
    for (const [label, kind] of [["XR", "kaspa-rpc"], ["XN", "kaspa-node"]] as const) {
      const X = workspace(config({ "testnet-10": { kind, network: "testnet-10", rpcUrl: OLD_BUILTIN_TN10 } }), signed!.ws);
      rs.push(
        await cli(`${label}-cli-accounts-balance`, ["accounts", "balance", alice, "--network", "testnet-10", "--json"], X),
        await cli(`${label}-cli-tx-plan`, ["tx", "plan", "--network", "testnet-10", "--from", "alice", "--to", "bob", "--amount", "1", "--json"], X),
        await sdk(`${label}-sdk-rpc`, X, `out.dag = (await hk.rpc.getBlockDagInfo())?.network ?? null;`)
      );
    }
    const seen = { paths: summary(rs) };
    trace("TPC-8a", seen);
    for (const r of rs) {
      expect(r.code, `${r.name}: ${r.brief}`).not.toBe("NETWORK_ENDPOINT_REQUIRED");
      expect(dialledOnly(r, "tn10.kaspa.stream"), `${r.name}: ${JSON.stringify(r.dialled)}`).toBe(true);
    }
  });

  it("TPC-8b a configuration loaded from file and resolved again — reloaded, validated, structuredClone'd, JSON round-tripped, composed with the built-ins, re-defined — keeps declared vs default: same answer in every form, zero connections", async () => {
    const script = path.join(logs, "tpc-8b.mjs");
    fs.writeFileSync(
      script,
      `const C = await import(${JSON.stringify(configDist)});\n` +
        `const cases = JSON.parse(process.argv[2]);\n` +
        `const answer = (form, networkId) => {\n` +
        `  let endpoint, workspace;\n` +
        `  try { const r = C.resolveNodeEndpoint({ config: form, networkId }); endpoint = { url: r.url, source: r.source }; } catch (e) { endpoint = { code: e?.code ?? String(e) }; }\n` +
        `  try { workspace = C.resolveWorkspaceExecution({ config: form, network: networkId }).rpcUrl ?? null; } catch (e) { workspace = { code: e?.code ?? String(e) }; }\n` +
        `  return { endpoint, workspace };\n` +
        `};\n` +
        `const out = {};\n` +
        `for (const { cwd, networks } of cases) {\n` +
        `  const loaded = (await C.loadHardkasConfig({ cwd })).config;\n` +
        `  let validated = "ok"; try { C.validateHardkasConfig(loaded); } catch (e) { validated = e?.code ?? String(e); }\n` +
        `  const reloaded = (await C.loadHardkasConfig({ cwd })).config;\n` +
        `  const json = JSON.parse(JSON.stringify(loaded));\n` +
        `  const forms = {\n` +
        `    loaded, reloaded, structuredClone: structuredClone(loaded), jsonRoundTrip: json,\n` +
        `    composedWithBuiltins: { ...structuredClone(C.DEFAULT_HARDKAS_CONFIG), ...json, networks: { ...structuredClone(C.DEFAULT_HARDKAS_CONFIG.networks), ...json.networks } },\n` +
        `    redefined: C.defineHardkasConfig(JSON.parse(JSON.stringify(reloaded)))\n` +
        `  };\n` +
        `  out[cwd] = { validated, answers: {} };\n` +
        `  for (const n of networks) out[cwd].answers[n] = Object.fromEntries(Object.entries(forms).map(([k, f]) => [k, answer(f, n)]));\n` +
        `}\n` +
        `(await import("node:fs")).writeFileSync(process.argv[3], JSON.stringify(out));\n`
    );
    const resultFile = path.join(logs, "tpc-8b.result.json");
    const canonical = `ws://127.0.0.1:${CANONICAL_PORT}`;
    const cases: Array<{ label: string; networks: Record<string, unknown>; expect: Record<string, { url?: string; source?: string; code?: string; workspace: string | null }> }> = [
      {
        label: "no-entry",
        networks: {},
        expect: {
          "testnet-10": { code: "NETWORK_ENDPOINT_REQUIRED", workspace: null },
          mainnet: { code: "NETWORK_ENDPOINT_REQUIRED", workspace: null },
          simnet: { url: canonical, source: "declared", workspace: canonical }
        }
      },
      {
        label: "kaspa-node-no-url",
        networks: { "testnet-10": { kind: "kaspa-node", network: "testnet-10" } },
        expect: { "testnet-10": { code: "NETWORK_ENDPOINT_REQUIRED", workspace: null } }
      },
      {
        label: "declared-old-builtin-url",
        networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: OLD_BUILTIN_TN10 } },
        expect: { "testnet-10": { url: OLD_BUILTIN_TN10, source: "declared", workspace: OLD_BUILTIN_TN10 } }
      },
      {
        label: "declared-own-node",
        networks: { "testnet-10": { kind: "kaspa-node", network: "testnet-10", rpcUrl: T.url } },
        expect: { "testnet-10": { url: T.url, source: "declared", workspace: T.url } }
      }
    ];
    const dirs = cases.map((c) => workspace(config(c.networks)));
    const r = await inProcess("tpc-8b", [script, JSON.stringify(cases.map((c, i) => ({ cwd: dirs[i], networks: Object.keys(c.expect) }))), resultFile], dirs[0]!);
    const got: any = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, "utf8")) : undefined;
    trace("TPC-8b", { cases: cases.map((c, i) => ({ label: c.label, cwd: dirs[i], expect: c.expect })), got, dialled: r.dialled });
    expect(got, r.brief).toBeTruthy();
    expect(r.dialled, "resolution alone never connects").toEqual([]);
    cases.forEach((c, i) => {
      const at = got[dirs[i]!];
      expect(at?.validated, `${c.label}: validation ${JSON.stringify(at)}`).toBe("ok");
      for (const [networkId, want] of Object.entries(c.expect)) {
        const forms = at.answers[networkId] as Record<string, any>;
        expect(Object.keys(forms).sort(), c.label).toEqual(["composedWithBuiltins", "jsonRoundTrip", "loaded", "redefined", "reloaded", "structuredClone"]);
        for (const [form, a] of Object.entries(forms)) {
          const where = `${c.label} ${networkId} [${form}]: ${JSON.stringify(a)}`;
          if (want.code) expect(a.endpoint, where).toEqual({ code: want.code });
          else expect(a.endpoint, where).toEqual({ url: want.url, source: want.source });
          expect(a.workspace, where).toEqual(want.workspace);
        }
      }
    });
  });

  it("TPC-8c a public network under a CUSTOM name (`network: \"testnet-10\"` / `\"mainnet\"`) without a URL never gets a local fallback: NETWORK_ENDPOINT_REQUIRED, zero connections", async () => {
    const C8 = workspace(
      config(
        {
          "my-tn10": { kind: "kaspa-node", network: "testnet-10" },
          "my-tn10-rpc": { kind: "kaspa-rpc", network: "testnet-10" },
          prod: { kind: "kaspa-node", network: "mainnet" }
        },
        "my-tn10"
      ),
      signed!.ws
    );
    // raw addresses: a named account of network "testnet-10" is refused earlier (ACCOUNT_NETWORK_MISMATCH vs "my-tn10"),
    // before the endpoint boundary this case measures
    const tnA = new kaspa.PrivateKey("33".repeat(32)).toAddress("testnet-10").toString();
    const tnB = new kaspa.PrivateKey("44".repeat(32)).toAddress("testnet-10").toString();
    const rs = [];
    for (const name of ["my-tn10", "my-tn10-rpc"]) {
      rs.push(
        await cli(`C8-${name}-cli-accounts-balance`, ["accounts", "balance", tnA, "--network", name, "--json"], C8),
        await cli(`C8-${name}-cli-tx-plan`, ["tx", "plan", "--network", name, "--from", tnA, "--to", tnB, "--amount", "1", "--json"], C8),
        await sdk(`C8-${name}-sdk-rpc`, C8, `out.dag = (await hk.rpc.getBlockDagInfo())?.network ?? null;`, name)
      );
    }
    rs.push(
      await cli("C8-prod-cli-accounts-balance", ["accounts", "balance", mainA, "--network", "prod", "--json"], C8),
      await cli("C8-prod-cli-tx-plan", ["tx", "plan", "--network", "prod", "--from", mainA, "--to", mainB, "--amount", "1", "--json"], C8),
      await sdk("C8-prod-sdk-rpc", C8, `out.dag = (await hk.rpc.getBlockDagInfo())?.network ?? null;`, "prod")
    );
    const seen = { paths: summary(rs), canonicalPortDialledBy: rs.filter(dialledCanonical).map((r) => r.name) };
    trace("TPC-8c", seen);
    expect(seen.canonicalPortDialledBy, JSON.stringify(seen, null, 1)).toEqual([]);
    // `tx plan` does not reach the endpoint boundary under a custom network name: it refuses earlier, typed, because the
    // planner keys network parameters and account networks on the config KEY ("my-tn10", "prod"), not on the entry's
    // `network` (registered: CUSTOM-NETWORK-PLAN-AUTHORITY-1, pre-existing). What this case pins for it: no connection at all.
    const plan = rs.filter((r) => r.name.endsWith("-cli-tx-plan"));
    for (const r of plan) {
      expect(r.dialled, `${r.name}: ${r.brief}`).toEqual([]);
      expect(r.exit, `${r.name}: ${r.brief}`).not.toBe(0);
      expect(["COINBASE_MATURITY_UNRESOLVED", "ACCOUNT_NETWORK_MISMATCH"], `${r.name}: ${r.brief}`).toContain(r.code);
    }
    expectEndpointRequired(rs.filter((r) => !plan.includes(r)), JSON.stringify(seen, null, 1));
  });
});

describe("TESTNET-PORT-COLLISION-1 · what keeps working", () => {

  it("TPC-2 control: testnet-10 as `kaspa-rpc` with an explicit rpcUrl (the own node T): every path dials T and only T", async () => {
    const R = workspace(config({ "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: T.url } }), signed!.ws);
    const rs = await testnetPaths("R", R);
    const target = `LOOPBACK_CONNECT 127.0.0.1:${T.port}`;
    const seen = { paths: summary(rs), notOnlyT: rs.filter((r) => r.dialled.some((d) => d !== target)).map((r) => r.name) };
    trace("TPC-2", seen);
    expect(rs.filter(dialledCanonical).map((r) => r.name), JSON.stringify(seen, null, 1)).toEqual([]);
    expect(seen.notOnlyT, JSON.stringify(seen, null, 1)).toEqual([]);
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
