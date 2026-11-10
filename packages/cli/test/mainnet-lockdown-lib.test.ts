import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { makeConsumerDir, removeConsumerDir, type ConsumerDir } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";
import { startDecoy, attemptsIn, type Decoy } from "./helpers/mainnet-decoy.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// -----------------------------------------------------------------------------
// MAINNET TOTAL LOCKDOWN (owner decision 2026-11-09; revokes MG-C2's read exception) · the libraries as a consumer
// imports them: @hardkas/sdk, @hardkas/kaspa-rpc, @hardkas/toolkit, @hardkas/node-runner and @hardkas/l2 resolved through
// node_modules → each package's `exports` → its BUILT dist (never the vitest source aliases). Each scenario runs in a
// child process with the hermetic preload (every connection attempt logged) against a loopback DECOY that counts TCP
// connections. Mainnet-typed refusal + zero connections, or — for an endpoint that lies about its network — refusal after
// its one identity answer and nothing else asked. Every HARDKAS_* opt-in that ever existed is set in the child.
// -----------------------------------------------------------------------------

let consumer: ConsumerDir | undefined;
const made: string[] = [];
const decoys: Decoy[] = [];
let n = 0;
const OPT_IN_ENV = {
  HARDKAS_ALLOW_MAINNET: "1",
  HARDKAS_MAINNET: "1",
  HARDKAS_MAINNET_ENABLED: "true",
  HARDKAS_MAINNET_CONNECTIONS: "1",
  HARDKAS_EXPERIMENTAL: "1",
  HARDKAS_ALLOW_PUBLIC: "1"
};

const PRELUDE = `
const sdkMod = await import("@hardkas/sdk");
const rpcMod = await import("@hardkas/kaspa-rpc");
const core = await import("@hardkas/core");
const out = {};
const outcome = async (label, f) => {
  try {
    const value = await f();
    out[label] = { ok: true, value: value === undefined ? null : JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) };
  } catch (e) {
    out[label] = { ok: false, code: e?.code ?? null, message: String(e?.message ?? e).slice(0, 500) };
  }
};
const k = core.loadManagedKaspaWasmSync();
const M1 = new k.PrivateKey("11".repeat(32)).toPublicKey().toAddress("mainnet").toString();
const M2 = new k.PrivateKey("22".repeat(32)).toPublicKey().toAddress("mainnet").toString();
const T1 = new k.PrivateKey("11".repeat(32)).toPublicKey().toAddress("testnet-10").toString();
const TXID = "ab".repeat(32);
`;

async function scenario(body: string, cwd: string): Promise<{ result: Record<string, any>; out: string; log: string; exit: number | null }> {
  const file = path.join(consumer!.dir, `scenario-${++n}.mjs`);
  fs.writeFileSync(file, `${PRELUDE}\n${body}\nconsole.log("RESULT " + JSON.stringify(out));\nprocess.exit(0);\n`);
  const log = path.join(consumer!.dir, `scenario-${n}.net.log`);
  const env = hermeticChildEnv(log, { HARDKAS_HERMETIC_DENY_PORTS: "16110,16210,17110,17210,18110,18210,18211", ...OPT_IN_ENV });
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { cwd, env, windowsHide: true });
    let text = "";
    const timer = setTimeout(() => child.kill(), 150_000);
    child.stdout.on("data", (d) => (text += String(d)));
    child.stderr.on("data", (d) => (text += String(d)));
    child.on("close", (exit) => {
      clearTimeout(timer);
      const line = text.split(/\r?\n/).reverse().find((l) => l.startsWith("RESULT "));
      resolve({ result: line ? JSON.parse(line.slice("RESULT ".length)) : {}, out: text, log, exit });
    });
  });
}

function workspace(label: string, cfg: Record<string, unknown>): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-mll-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  return ws;
}

function cfgFor(name: string, declared: string, url: string): Record<string, unknown> {
  return {
    defaultNetwork: name,
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: name } } },
    network: { allowPublic: true },
    experimental: true,
    networks: { [name]: { kind: "kaspa-rpc", network: declared, rpcUrl: url, allowMainnet: true } }
  };
}

async function decoy(network: string, evmChainId?: number): Promise<Decoy> {
  const d = await startDecoy(network, evmChainId);
  decoys.push(d);
  return d;
}

function expectNoContact(r: { out: string; log: string }, d: Decoy) {
  const net = attemptsIn(r.log, d.port);
  const seen = { connections: d.connections, methods: d.methods, attempts: net.toPort, refused: net.refused, tail: r.out.slice(-800) };
  expect(d.connections, JSON.stringify(seen)).toBe(0);
  expect(net.toPort, JSON.stringify(seen)).toBe(0);
  expect(net.refused, JSON.stringify(seen)).toEqual([]);
}

beforeAll(() => {
  assertHermeticPreloadActive();
  consumer = makeConsumerDir("hk-mll-", ["sdk", "kaspa-rpc", "core", "config", "toolkit", "node-runner", "l2", "artifacts"]);
});
afterAll(async () => {
  for (const d of decoys) await d.close();
  removeConsumerDir(consumer);
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

const SDK_OPS = `
const signedArtifact = { schema: core.HardkasSchemas.SignedTx, networkId: "mainnet", mode: "rpc", execution: { mode: "rpc", domain: "kaspa-l1", network: "mainnet" }, status: "signed", txId: TXID, signedTransaction: { format: "hex", payload: "{}" } };
const planArtifact = { schema: core.HardkasSchemas.TxPlan, networkId: "mainnet", mode: "rpc", execution: { mode: "rpc", domain: "kaspa-l1", network: "mainnet" }, inputs: [], outputs: [] };
let signerCalls = 0;
const signer = { async getAddress() { return M1; }, async signTransaction() { signerCalls++; throw new Error("the external signer must never be asked"); } };
let sdk;
await outcome("open", async () => { sdk = await sdkMod.Hardkas.open({ cwd: process.cwd(), network: NETWORK, policy: { allowPublic: true }, signer }); return { network: sdk.network }; });
if (sdk) {
  await outcome("rpc.getBlockDagInfo", () => sdk.rpc.getBlockDagInfo());
  await outcome("rpc.getBalanceByAddress", () => sdk.rpc.getBalanceByAddress(M1));
  await outcome("tx.plan", () => sdk.tx.plan({ from: M1, to: M2, amount: "1" }));
  await outcome("accounts.getBalance", () => sdk.accounts.getBalance(M1));
  await outcome("fees.estimate", () => sdk.fees.estimate({ priority: "normal", inputs: 1, outputs: 2 }));
  await outcome("observe.address", () => sdk.observe.address({ address: M1 }));
  await outcome("tx.observe", () => sdk.tx.observe(TXID, { persist: false }));
  await outcome("tx.waitForAccepted", () => sdk.tx.waitForAccepted({ txId: TXID, timeoutMs: 4000, pollIntervalMs: 200 }));
  await outcome("utxos.waitFor", () => sdk.utxos.waitFor ? sdk.utxos.waitFor({ address: M1, timeoutMs: 4000, pollIntervalMs: 200 }) : Promise.reject(Object.assign(new Error("n/a"), { code: "N_A" })));
  await outcome("node.waitForSettlement", () => sdk.node.waitForSettlement({ timeoutMs: 3000, intervalMs: 200 }));
  await outcome("wallet.open", () => sdk.wallet.open("mll-wallet"));
  await outcome("tx.sign", () => sdk.tx.sign(planArtifact));
  await outcome("tx.send", () => sdk.tx.send(signedArtifact));
  await outcome("workflow.run", async () => { const run = await sdk.workflow.run({ steps: [{ type: "tx.plan", from: M1, to: M2, amount: 1 }, { type: "tx.send" }] }); return { status: run.status, code: run.errorEnvelope?.code ?? null }; });
  await outcome("covenants.checkCapabilities", () => sdk.covenants.checkCapabilities());
  await outcome("capabilities.get", async () => { const c = await sdk.capabilities.get(); return { igra: c?.environment?.igra ?? null }; });
  out.signerCalls = signerCalls;
  await sdk.close();
}
`;

const CONNECTION = "MAINNET_CONNECTION_DISABLED";
const expectedSdk: Record<string, string> = {
  "rpc.getBlockDagInfo": CONNECTION,
  "rpc.getBalanceByAddress": CONNECTION,
  "tx.plan": CONNECTION,
  "accounts.getBalance": CONNECTION,
  "fees.estimate": CONNECTION,
  "observe.address": CONNECTION,
  "tx.observe": CONNECTION,
  "tx.waitForAccepted": CONNECTION,
  "node.waitForSettlement": CONNECTION,
  "wallet.open": CONNECTION,
  // the operation's own guard names the refusal (the order of @hardkas/core mainnet-policy): before any connection,
  // signer call or record
  "tx.sign": "MAINNET_SIGNING_DISABLED",
  "tx.send": "MAINNET_BROADCAST_DISABLED"
};

describe("MAINNET TOTAL LOCKDOWN · SDK (built dist) · a mainnet instance opens offline and every path is refused, typed, with zero connections", () => {
  for (const [label, name, declared] of [
    ["network 'mainnet'", "mainnet", "mainnet"],
    ["an alias 'prod' declaring 'kaspa-mainnet'", "prod", "kaspa-mainnet"],
    ["an alias 'live' declaring 'mainnet-1'", "live", "mainnet-1"]
  ] as const) {
    it(`${label}`, async () => {
      const d = await decoy("mainnet");
      const ws = workspace("sdk", cfgFor(name, declared, d.url));
      const r = await scenario(`const NETWORK = ${JSON.stringify(name)};\n${SDK_OPS}`, ws);
      const res = r.result;
      const seen = JSON.stringify({ res, tail: r.out.slice(-1500) });
      expect(res.open?.ok, seen).toBe(true);
      for (const [op, code] of Object.entries(expectedSdk)) expect({ op, code: res[op]?.code }, seen).toEqual({ op, code });
      expect(res["workflow.run"]?.value ?? res["workflow.run"], seen).toMatchObject({ code: CONNECTION });
      expect(res.signerCalls, seen).toBe(0);
      expectNoContact(r, d);
    });
  }
});

describe("MAINNET TOTAL LOCKDOWN · transport, toolkit, node-runner, multinode, L2 (built dist): a mainnet network is never dialled", () => {
  it("every client built for a mainnet network (any spelling), the health check, the endpoint identity, a node set, a wallet watch, an L2 mainnet client", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("raw", cfgFor("testnet-10", "testnet-10", d.url));
    const body = `
const URL = ${JSON.stringify(d.url)};
const HTTP = ${JSON.stringify(d.httpUrl)};
for (const net of ["mainnet", "kaspa", "mainnet-1", "kaspa-mainnet", "MAINNET"]) {
  await outcome("JsonWrpcKaspaClient:" + net, () => new rpcMod.JsonWrpcKaspaClient({ rpcUrl: URL, expectedNetworkId: net }).getServerInfo());
}
await outcome("KaspaWrpcClient.connect", () => new rpcMod.KaspaWrpcClient(URL, { expectedNetworkId: "mainnet" }).connect(2000));
await outcome("KaspaJsonRpcClient", () => new rpcMod.KaspaJsonRpcClient({ url: URL, expectedNetworkId: "mainnet", retry: { maxRetries: 0 } }).getBlockDagInfo());
const nodeRunner = await import("@hardkas/node-runner");
await outcome("verifyEndpointIdentity", () => nodeRunner.verifyEndpointIdentity(URL, "mainnet"));
await outcome("readNodeSet", () => sdkMod.readNodeSet([{ label: "a", client: new rpcMod.JsonWrpcKaspaClient({ rpcUrl: URL }) }, { label: "b", client: new rpcMod.JsonWrpcKaspaClient({ rpcUrl: URL.replace("127.0.0.1", "localhost") }) }], { expectedNetwork: "mainnet" }));
const toolkit = await import("@hardkas/toolkit");
await outcome("WalletToolkit.watch", () => toolkit.WalletToolkit.open("mll-watch", { networkId: "mainnet", rpcUrl: URL, storePath: process.cwd() + "/.hardkas/w.json" }).watch(() => {}));
const l2 = await import("@hardkas/l2");
await outcome("l2.profile", () => new l2.EvmJsonRpcClient({ url: HTTP, profile: "igra-mainnet" }).getChainId());
await outcome("l2.chainId", () => new l2.EvmJsonRpcClient({ url: HTTP, expectedChainId: 38833 }).getChainId());
await outcome("l2.write", async () => l2.assertL2WriteAllowed({ chainId: 38833, allowMainnet: true, operation: "mll write" }));
// RC2 oracle O7: the health check takes the network it uses the node as; a mainnet one is refused before connecting,
// and the readiness wait returns that refusal at once
await outcome("health expected mainnet", () => rpcMod.checkKaspaRpcHealth({ url: URL, expectedNetworkId: "mainnet", timeoutMs: 2000 }));
await outcome("health expected kaspa (http)", () => rpcMod.checkKaspaRpcHealth({ url: HTTP, expectedNetworkId: "kaspa", timeoutMs: 2000 }));
await outcome("waitForKaspaRpcReady expected kaspa-mainnet", async () => { const t0 = Date.now(); const w = await rpcMod.waitForKaspaRpcReady({ url: URL, expectedNetworkId: "kaspa-mainnet", maxWaitMs: 20000, timeoutMs: 2000 }); return { ready: w.ready, error: w.error ?? w.lastError ?? null, ms: Date.now() - t0 }; });
`;
    const r = await scenario(body, ws);
    const res = r.result;
    const seen = JSON.stringify({ res, tail: r.out.slice(-1500) });
    for (const op of ["health expected mainnet", "health expected kaspa (http)", "waitForKaspaRpcReady expected kaspa-mainnet"]) {
      expect({ op, ready: res[op]?.value?.ready }, seen).toEqual({ op, ready: false });
      expect(`${res[op]?.value?.error ?? ""} ${res[op]?.value?.lastError ?? ""}`, seen).toMatch(/MAINNET_CONNECTION_DISABLED/);
    }
    expect(res["waitForKaspaRpcReady expected kaspa-mainnet"]?.value?.ms, seen).toBeLessThan(5_000);
    for (const net of ["mainnet", "kaspa", "mainnet-1", "kaspa-mainnet", "MAINNET"]) expect(res[`JsonWrpcKaspaClient:${net}`]?.code, seen).toBe(CONNECTION);
    for (const op of ["KaspaWrpcClient.connect", "KaspaJsonRpcClient", "verifyEndpointIdentity", "readNodeSet", "WalletToolkit.watch", "l2.profile", "l2.chainId"]) {
      expect({ op, code: res[op]?.code }, seen).toEqual({ op, code: CONNECTION });
    }
    expect(res["l2.write"]?.code, seen).toBe("L2_MAINNET_WRITE_BLOCKED");
    expectNoContact(r, d);
  });

  it("a node behind an endpoint used as testnet-10 (or raw) that answers mainnet: refused after its one identity answer, nothing else asked, never asked again", async () => {
    const d = await decoy("mainnet");
    const ws = workspace("lie", cfgFor("testnet-10", "testnet-10", d.url));
    const body = `
const URL = ${JSON.stringify(d.url)};
const HTTP = ${JSON.stringify(d.httpUrl)};
const asTn = new rpcMod.JsonWrpcKaspaClient({ rpcUrl: URL, expectedNetworkId: "testnet-10" });
await outcome("expected testnet-10", () => asTn.getUtxosByAddresses([T1]));
await outcome("expected testnet-10, again", () => asTn.getBalanceByAddress(T1));
const raw = new rpcMod.JsonWrpcKaspaClient({ rpcUrl: URL });
await outcome("raw", () => raw.getBalanceByAddress(T1));
await outcome("raw, again", () => raw.getBlockDagInfo());
await outcome("health", () => rpcMod.checkKaspaRpcHealth({ url: URL, timeoutMs: 3000 }));
await outcome("KaspaWrpcClient raw", () => new rpcMod.KaspaWrpcClient(URL).connect(3000));
const toolkit = await import("@hardkas/toolkit");
await outcome("WalletToolkit.watch simnet", () => toolkit.WalletToolkit.open("mll-watch2", { networkId: "simnet", rpcUrl: URL, storePath: process.cwd() + "/.hardkas/w2.json" }).watch(() => {}));
const l2 = await import("@hardkas/l2");
const evm = new l2.EvmJsonRpcClient({ url: HTTP });
await outcome("l2 unbound eth_chainId", () => evm.getChainId());
await outcome("l2 unbound, again", () => evm.callRpc("eth_blockNumber", []));
await asTn.close(); await raw.close();
// RC2 oracle O6: the SDK's fee estimate on that node is the refusal, never the relay minimum as if it were unreachable
let sdkTn;
await outcome("sdk testnet-10 open", async () => { sdkTn = await sdkMod.Hardkas.open({ cwd: process.cwd(), network: "testnet-10", policy: { allowPublic: true } }); return { network: sdkTn.network }; });
if (sdkTn) {
  await outcome("sdk testnet-10 fees.estimate", () => sdkTn.fees.estimate({ priority: "normal", inputs: 1, outputs: 2 }));
  await sdkTn.close();
}
`;
    const r = await scenario(body, ws);
    const res = r.result;
    const seen = JSON.stringify({ res, methods: d.methods, connections: d.connections, tail: r.out.slice(-1500) });
    for (const op of ["expected testnet-10", "expected testnet-10, again", "raw", "raw, again", "KaspaWrpcClient raw", "WalletToolkit.watch simnet", "l2 unbound eth_chainId", "l2 unbound, again", "sdk testnet-10 fees.estimate"]) {
      expect({ op, code: res[op]?.code }, seen).toEqual({ op, code: CONNECTION });
    }
    expect(res.health?.value?.ready, seen).toBe(false);
    expect(String(res.health?.value?.error ?? ""), seen).toMatch(/MAINNET_CONNECTION_DISABLED/);
    // the one identity question per client, and nothing else; a refused session never connects again (six clients:
    // asTn, raw, the health check, KaspaWrpcClient, the wallet watch and the SDK instance)
    expect(d.methods.filter((m) => m !== "getServerInfo" && m !== "http:eth_chainId"), seen).toEqual([]);
    expect(d.methods.filter((m) => m === "http:eth_chainId"), seen).toHaveLength(1);
    expect(d.methods.filter((m) => m === "getServerInfo").length, seen).toBeLessThanOrEqual(6);
  });

  it("control: a node that says testnet-10, used as testnet-10, is read (the decoy and the log see the connection)", async () => {
    const d = await decoy("testnet-10");
    const ws = workspace("ctl", cfgFor("testnet-10", "testnet-10", d.url));
    const r = await scenario(`const c = new rpcMod.JsonWrpcKaspaClient({ rpcUrl: ${JSON.stringify(d.url)}, expectedNetworkId: "testnet-10" });\nawait outcome("info", () => c.getServerInfo());\nawait c.close();`, ws);
    const seen = JSON.stringify({ res: r.result, tail: r.out.slice(-800) });
    expect(r.result.info?.ok, seen).toBe(true);
    expect(r.result.info?.value?.networkId, seen).toBe("testnet-10");
    expect(d.connections, seen).toBeGreaterThan(0);
    expect(attemptsIn(r.log, d.port).toPort, seen).toBeGreaterThan(0);
  });
});
