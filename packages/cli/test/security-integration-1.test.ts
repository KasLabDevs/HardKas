import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { cliDist, childEnv, repoRoot } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

// -----------------------------------------------------------------------------
// SECURITY-INTEGRATION-1 (2026-10-13). The three network protections, working together on one tree:
//   NODE-NETWORK-IDENTITY-1 (NNI)      the node behind a connection must say it serves the instance's network, on
//                                      every connection (getServerInfo; what the node DECLARES, not an authentication);
//   ENDPOINT-AUTHORITY-1 (EA)          an explicit endpoint must be the client's; a send happens only on the network
//                                      the artifact was signed for; records name the client's endpoint;
//   SDK-MAINNET-BROADCAST-GUARD-1 (MG) no signature and no broadcast on mainnet, from any identity involved.
// Cross cases: a testnet artifact never reaches a node that declares mainnet; an explicit URL B never replaces the
// connection A; an external signer is never asked for mainnet; a reconnection is verified again; every refusal before
// transmission leaves 0 submitTransaction, 0 submission records and 0 submission events; credentials in an endpoint
// (userinfo, secret query parameters) never reach receipts, events, errors or the workspace.
// FAKE nodes on loopback only (never a real node, no funds): each declares the network it is told to. Built CLI + built
// SDK, real pinned kaspa-wasm. Each case writes what the fakes received and what HardKAS recorded to
// $HARDKAS_SI_TRACE_DIR (evidence).
// -----------------------------------------------------------------------------

type Fake = { url: string; port: number; label: string; methods: string[]; close(): Promise<void> };

let kaspa: any;
/** EXPECTED-TXID-1: the official id of a transaction as the fake node receives it (set in beforeAll). */
let txIdOfReceived: (transaction: unknown) => string;
const hashOf = (n: number) => n.toString(16).padStart(64, "0");
function spkHex(address: string): string {
  const spk = kaspa.payToAddressScript(address);
  const script = typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex");
  return spk.version.toString(16).padStart(4, "0") + script;
}

/**
 * A fake node declaring `network`. Mainnet fakes REFUSE every submitTransaction (they only record the attempt); the
 * others answer like a node that accepted it (nothing leaves this process). `port` reuses a port (a restart).
 */
async function startFake(label: string, network: string, port = 0): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  await new Promise<void>((r, j) => {
    server.on("listening", () => r());
    server.on("error", j);
  });
  const methods: string[] = [];
  const DAA = 50_000_000;
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
      methods.push(method);
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
          if (network === "mainnet") return err(`Rejected transaction ${hashOf(0xabc)}: fake mainnet node never accepts`);
          // EXPECTED-TXID-1: like a node, it names the transaction it received (its official kaspa-wasm id)
          return ok({ transactionId: txIdOfReceived(params?.transaction) });
        default:
          return err(`fake ${label} does not implement ${method}`);
      }
    });
  });
  const bound = (server.address() as AddressInfo).port;
  return {
    url: `ws://127.0.0.1:${bound}`,
    port: bound,
    label,
    methods,
    close: () =>
      new Promise<void>((r) => {
        for (const c of server.clients) c.terminate();
        server.close(() => r());
      })
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// credentials an endpoint may carry: userinfo and a secret-named query parameter (both must never be recorded)
const USER_SECRET = "si-pass-SECRET-7f3a";
const TOKEN_SECRET = "si-token-SECRET-91c2";
const SECRETS = [USER_SECRET, TOKEN_SECRET];
const withSecrets = (f: Fake) => `ws://hkuser:${USER_SECRET}@127.0.0.1:${f.port}/?token=${TOKEN_SECRET}`;
const leaks = (text: string) => SECRETS.filter((s) => text.includes(s));

const PW = "si-test-password-only";
const traceDir = process.env.HARDKAS_SI_TRACE_DIR;
function trace(name: string, data: unknown) {
  if (!traceDir) return;
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(path.join(traceDir, `${name}.json`), JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}

// Asynchronous on purpose: the fakes live in this process, a synchronous spawn would freeze them mid-handshake.
async function run(args: string[], cwd: string) {
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: childEnv({ HK_SI_PW: PW }) });
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
  let doc: any;
  for (const chunk of r.stdout.split(/\r?\n(?=[{\[])/)) {
    try {
      const d = JSON.parse(chunk.trim());
      if (d && typeof d === "object" && !Array.isArray(d)) doc = doc ?? d;
    } catch {
      /* not a document */
    }
  }
  return { ...r, doc, brief: `exit ${r.status}\n${r.stdout.slice(0, 1500)}\n${r.stderr.slice(0, 800)}` };
}

type Net = { network: string; url: string };
/** One execution target (the first network) and every network's RPC endpoint. */
const config = (nets: Net[], extra: Record<string, unknown> = {}) =>
  `export default ${JSON.stringify({
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: nets[0]!.network } } },
    networks: Object.fromEntries(nets.map((n) => [n.network, { kind: "kaspa-rpc", network: n.network, rpcUrl: n.url }])),
    ...extra
  })};\n`;
const testnetConfig = (url: string, extra: Record<string, unknown> = {}) => config([{ network: "testnet-10", url }], extra);
const CLI_EXTRA = { experimental: true, network: { allowPublic: true } };

let template: string;
const made: string[] = [];
function workspace(cfg: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-si-"));
  made.push(ws);
  fs.cpSync(template, ws, { recursive: true });
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), cfg);
  return ws;
}
/**
 * The same workspace state (store, keystores) under another config. A NEW directory: the config loader caches a
 * config by path for the life of the process, so rewriting one in place would leave this process on the old one.
 */
function moved(from: string, cfg: string): string {
  const ws = workspace(cfg);
  fs.cpSync(path.join(from, ".hardkas"), path.join(ws, ".hardkas"), { recursive: true, force: true });
  return ws;
}

const dist = (pkg: string) => import(pathToFileURL(path.join(repoRoot, "packages", pkg, "dist", "index.js")).href);
let sdkMod: any;
let coreMod: any;
let accountsMod: any;

const ledger = (ws: string): any[] => {
  const file = coreMod.eventLedgerPath(ws);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : [];
};
function stored(ws: string, schema: RegExp): string[] {
  const root = path.join(ws, ".hardkas", "artifacts");
  if (!fs.existsSync(root)) return [];
  return (fs.readdirSync(root, { recursive: true }) as string[])
    .map(String)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => {
      try {
        return schema.test(String(JSON.parse(fs.readFileSync(path.join(root, f), "utf8")).schema));
      } catch {
        return false;
      }
    });
}
/** Every file HardKAS wrote in the workspace (the user's own config excluded) that contains a secret. */
function filesLeaking(ws: string): string[] {
  const out: string[] = [];
  for (const rel of fs.readdirSync(ws, { recursive: true }) as string[]) {
    const p = path.join(ws, String(rel));
    if (String(rel) === "hardkas.config.ts" || !fs.statSync(p).isFile()) continue;
    if (leaks(fs.readFileSync(p).toString("latin1")).length) out.push(String(rel));
  }
  return out;
}
const SUBMISSION = /txSubmission/;
const SUBMISSION_EVENTS = /workflow\.(submitted|failed)|rpc\.error/;
const submits = (...fakes: Fake[]) => Object.fromEntries(fakes.map((f) => [f.label, f.methods.filter((m) => m === "submitTransaction").length]));
/** What a refusal before transmission must leave behind: nothing. */
function effects(ws: string, ...fakes: Fake[]) {
  return {
    submitTransaction: submits(...fakes),
    submissionRecords: stored(ws, SUBMISSION),
    submissionEvents: ledger(ws).map((e) => e.kind).filter((k) => SUBMISSION_EVENTS.test(k))
  };
}
function expectNoEffects(seen: { submitTransaction: Record<string, number>; submissionRecords: string[]; submissionEvents: string[] }, why: string) {
  expect(Object.values(seen.submitTransaction).every((n) => n === 0), why).toBe(true);
  expect(seen.submissionRecords, why).toEqual([]);
  expect(seen.submissionEvents, why).toEqual([]);
}

async function refusal(p: Promise<unknown>): Promise<{ code?: string; message: string; data?: unknown }> {
  try {
    await p;
  } catch (e: any) {
    return { code: e?.code, message: String(e?.message ?? e), data: e?.data ?? e?.metadata };
  }
  return { code: "(no refusal: the call succeeded)", message: "the call succeeded" };
}

const openOn = (ws: string, network: string, extra: Record<string, unknown> = {}) =>
  sdkMod.Hardkas.open({ cwd: ws, network, policy: { allowPublic: true }, ...extra });

/** Plans and signs (internal signer, keystore account alice) on a testnet-10 instance of `ws`. */
async function signedOn(ws: string): Promise<any> {
  const sdk = await openOn(ws, "testnet-10");
  try {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
    return await sdk.tx.sign(plan, { account: "alice", keystorePassword: PW });
  } finally {
    await sdk.close?.();
  }
}
/** A testnet-10 plan from the external signer's own address (planned on `ws`, a testnet-10 workspace). */
async function externalPlanOn(ws: string): Promise<any> {
  const sdk = await openOn(ws, "testnet-10");
  try {
    return await sdk.tx.plan({ from: T.address, to: T2.address, amount: "1" });
  } finally {
    await sdk.close?.();
  }
}
const signedFileOf = (ws: string) =>
  path.join(ws, ".hardkas", "artifacts", "signed", fs.readdirSync(path.join(ws, ".hardkas", "artifacts", "signed")).find((f) => f.startsWith("signedTx-"))!);

type Keys = { address: string; env: string };
let T: Keys; // testnet-10 key of the EXTERNAL signer (throwaway, in memory)
let T2: Keys;
function throwawayKey(env: string): Keys {
  const pk = new kaspa.PrivateKey(crypto.randomBytes(32).toString("hex"));
  process.env[env] = pk.toString(); // this test process only; never printed or stored
  return { address: pk.toAddress("testnet-10").toString(), env };
}
/** An external signer (a hardware wallet, a custodian): it signs what it is given. Counts its calls. */
function externalSigner() {
  const calls = { n: 0 };
  return {
    calls,
    signer: {
      async getAddress() {
        return T.address;
      },
      async signTransaction(plan: any) {
        calls.n++;
        return accountsMod.signTxPlanArtifact({
          target: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" },
          planArtifact: plan,
          account: { name: "external", kind: "kaspa", network: "testnet-10", address: T.address, privateKeyEnv: T.env } as any
        });
      }
    }
  };
}

beforeAll(async () => {
  // the SAME module instances the SDK uses (a path import would load a second @hardkas/core with its own event bus)
  coreMod = await import("@hardkas/core");
  accountsMod = await import("@hardkas/accounts");
  sdkMod = await dist("sdk");
  kaspa = coreMod.loadManagedKaspaWasmSync();
  txIdOfReceived = (await dist("kaspa-rpc")).officialTxIdOf;
  T = throwawayKey("HK_SI_EXT_PK");
  T2 = throwawayKey("HK_SI_EXT2_PK");
  template = fs.mkdtempSync(path.join(os.tmpdir(), "hk-si-template-"));
  made.push(template);
  fs.mkdirSync(path.join(template, ".hardkas"));
  // keys generated in a scaffold-shaped workspace (simulator default), as `hardkas init` leaves it
  fs.writeFileSync(
    path.join(template, "hardkas.config.ts"),
    'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } }, network: { allowPublic: false } };\n'
  );
  for (const name of ["alice", "bob"]) {
    const r = await run(["accounts", "real", "generate", "--name", name, "--network", "testnet-10", "--password-env", "HK_SI_PW", "--json"], template);
    expect(r.status, r.brief).toBe(0);
  }
});
afterAll(() => {
  for (const ws of made) fs.rmSync(ws, { recursive: true, force: true });
  for (const k of [T, T2]) if (k) delete process.env[k.env];
});

describe("SECURITY-INTEGRATION-1 · a testnet artifact never reaches a node that declares mainnet (NNI + EA + MG)", () => {
  it("SI-1 sdk.tx.send of a testnet-10 artifact, the instance's endpoint now answered by a node declaring mainnet: NODE_NETWORK_MISMATCH, nothing sent or recorded", async () => {
    const A = await startFake("A", "testnet-10");
    const M = await startFake("M", "mainnet");
    try {
      const signedWs = workspace(testnetConfig(A.url));
      const signed = await signedOn(signedWs);
      // the same workspace state, its testnet-10 endpoint now pointing at a node that declares mainnet
      const ws = moved(signedWs, testnetConfig(M.url));
      const sdk = await openOn(ws, "testnet-10");
      const detach = coreMod.attachLedgerAppender(ws);
      let r: any;
      try {
        r = await refusal(sdk.tx.send(signed));
      } finally {
        detach();
        await sdk.close?.();
      }
      const seen = { refusal: { code: r.code, message: r.message.slice(0, 300) }, mMethods: M.methods, ...effects(ws, A, M) };
      trace("SI-1", seen);
      expect(r.code, JSON.stringify(seen)).toBe("NODE_NETWORK_MISMATCH");
      expect(M.methods.filter((m) => m !== "getServerInfo"), JSON.stringify(seen)).toEqual([]);
      expectNoEffects(seen, JSON.stringify(seen));
    } finally {
      await A.close();
      await M.close();
    }
  });

  it("SI-1c CLI tx send --url <node declaring mainnet> in a testnet-10 workspace on A: refused NODE_NETWORK_MISMATCH; A and M receive no submission", async () => {
    const A = await startFake("A", "testnet-10");
    const M = await startFake("M", "mainnet");
    try {
      const ws = workspace(testnetConfig(A.url, CLI_EXTRA));
      await signedOn(ws);
      const r = await run(["tx", "send", signedFileOf(ws), "--url", M.url, "--yes", "--json"], ws);
      const seen = { exit: r.status, code: r.doc?.code ?? null, mMethods: M.methods, ...effects(ws, A, M) };
      trace("SI-1c", seen);
      expect(r.status, r.brief).not.toBe(0);
      expect(seen.code, r.brief).toBe("NODE_NETWORK_MISMATCH");
      expectNoEffects(seen, r.brief);
    } finally {
      await A.close();
      await M.close();
    }
  });

  it("SI-1d CLI tx send without --url, the workspace's testnet-10 endpoint answered by a node declaring mainnet: refused NODE_NETWORK_MISMATCH", async () => {
    const A = await startFake("A", "testnet-10");
    const M = await startFake("M", "mainnet");
    try {
      const ws = workspace(testnetConfig(A.url, CLI_EXTRA));
      await signedOn(ws);
      fs.writeFileSync(path.join(ws, "hardkas.config.ts"), testnetConfig(M.url, CLI_EXTRA));
      const r = await run(["tx", "send", signedFileOf(ws), "--yes", "--json"], ws);
      const seen = { exit: r.status, code: r.doc?.code ?? null, mMethods: M.methods, ...effects(ws, A, M) };
      trace("SI-1d", seen);
      expect(r.status, r.brief).not.toBe(0);
      expect(seen.code, r.brief).toBe("NODE_NETWORK_MISMATCH");
      expectNoEffects(seen, r.brief);
    } finally {
      await A.close();
      await M.close();
    }
  });
});

describe("SECURITY-INTEGRATION-1 · an explicit URL B never replaces the effective connection A", () => {
  it("SI-2 sdk.tx.send(signed, B) on an instance on A, B declaring mainnet: SEND_ENDPOINT_MISMATCH before B is even asked who it is", async () => {
    const A = await startFake("A", "testnet-10");
    const B = await startFake("B", "mainnet");
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const sdk = await openOn(ws, "testnet-10");
      const detach = coreMod.attachLedgerAppender(ws);
      const aBefore = A.methods.length;
      let r: any;
      try {
        r = await refusal(sdk.tx.send(signed, B.url));
      } finally {
        detach();
        await sdk.close?.();
      }
      const seen = { refusal: { code: r.code, message: r.message.slice(0, 300) }, aAfterOpen: A.methods.slice(aBefore), bMethods: B.methods, ...effects(ws, A, B) };
      trace("SI-2", seen);
      expect(r.code, JSON.stringify(seen)).toBe("SEND_ENDPOINT_MISMATCH");
      expect(seen.bMethods, JSON.stringify(seen)).toEqual([]);
      expect(seen.aAfterOpen, JSON.stringify(seen)).toEqual([]);
      expectNoEffects(seen, JSON.stringify(seen));
    } finally {
      await A.close();
      await B.close();
    }
  });

  it("SI-2b the same with B declaring testnet-10 (a healthy node, just not the instance's): still SEND_ENDPOINT_MISMATCH, B receives nothing", async () => {
    const A = await startFake("A", "testnet-10");
    const B = await startFake("B", "testnet-10");
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const sdk = await openOn(ws, "testnet-10");
      let r: any;
      try {
        r = await refusal(sdk.tx.send(signed, B.url));
      } finally {
        await sdk.close?.();
      }
      const seen = { refusal: { code: r.code }, bMethods: B.methods, ...effects(ws, A, B) };
      trace("SI-2b", seen);
      expect(r.code, JSON.stringify(seen)).toBe("SEND_ENDPOINT_MISMATCH");
      expect(seen.bMethods).toEqual([]);
      expectNoEffects(seen, JSON.stringify(seen));
    } finally {
      await A.close();
      await B.close();
    }
  });
});

describe("SECURITY-INTEGRATION-1 · an external signer is never asked for mainnet", () => {
  it("SI-3a a testnet-10 plan on a mainnet instance with an external signer: MAINNET_SIGNING_DISABLED, 0 signer calls, nothing written", async () => {
    const A = await startFake("A", "testnet-10");
    const M = await startFake("M", "mainnet");
    try {
      const tws = workspace(testnetConfig(A.url));
      const plan = await externalPlanOn(tws);
      const mws = workspace(config([{ network: "mainnet", url: M.url }]));
      const ext = externalSigner();
      const sdk = await openOn(mws, "mainnet", { signer: ext.signer });
      let r: any;
      try {
        r = await refusal(sdk.tx.sign(plan));
      } finally {
        await sdk.close?.();
      }
      const seen = { refusal: { code: r.code }, signerCalls: ext.calls.n, signed: stored(mws, /signedTx/), mMethods: M.methods };
      trace("SI-3a", seen);
      expect(r.code, JSON.stringify(seen)).toBe("MAINNET_SIGNING_DISABLED");
      expect(seen.signerCalls).toBe(0);
      expect(seen.signed).toEqual([]);
      expect(M.methods).not.toContain("submitTransaction");
    } finally {
      await A.close();
      await M.close();
    }
  });

  it.each([
    ["networkId", (p: any) => ({ ...p, networkId: "mainnet" })],
    ["execution.network", (p: any) => ({ ...p, execution: { ...(p.execution ?? {}), network: "mainnet" } })]
  ])("SI-3b a plan whose %s says mainnet, on a testnet-10 instance with an external signer: MAINNET_SIGNING_DISABLED, 0 signer calls", async (label, tamper) => {
    const A = await startFake("A", "testnet-10");
    try {
      const ws = workspace(testnetConfig(A.url));
      const plan = tamper(await externalPlanOn(ws));
      const ext = externalSigner();
      const sdk = await openOn(ws, "testnet-10", { signer: ext.signer });
      let r: any;
      try {
        r = await refusal(sdk.tx.sign(plan));
      } finally {
        await sdk.close?.();
      }
      const seen = { label, refusal: { code: r.code }, signerCalls: ext.calls.n, signed: stored(ws, /signedTx/) };
      trace(`SI-3b-${label}`, seen);
      expect(r.code, JSON.stringify(seen)).toBe("MAINNET_SIGNING_DISABLED");
      expect(seen.signerCalls).toBe(0);
      expect(seen.signed).toEqual([]);
    } finally {
      await A.close();
    }
  });

  it("SI-3c a workflow [tx.plan, tx.send] on a mainnet instance with an external signer: 0 signer calls, 0 submitTransaction", async () => {
    const M = await startFake("M", "mainnet");
    try {
      const ws = workspace(config([{ network: "mainnet", url: M.url }]));
      const ext = externalSigner();
      const sdk = await openOn(ws, "mainnet", { signer: ext.signer });
      let runResult: any;
      try {
        const main = new kaspa.PrivateKey(crypto.randomBytes(32).toString("hex")).toAddress("mainnet").toString();
        runResult = await sdk.workflow.run({ steps: [{ type: "tx.plan", from: main, to: main, amount: 1 } as any, { type: "tx.send" } as any] }).catch((e: any) => ({ status: "threw", code: e?.code }));
      } finally {
        await sdk.close?.();
      }
      const seen = { status: runResult?.status, code: runResult?.errorEnvelope?.code ?? runResult?.code, signerCalls: ext.calls.n, ...effects(ws, M) };
      trace("SI-3c", seen);
      expect(seen.signerCalls, JSON.stringify(seen)).toBe(0);
      expect(seen.submitTransaction, JSON.stringify(seen)).toEqual({ M: 0 });
      expect(seen.submissionRecords).toEqual([]);
    } finally {
      await M.close();
    }
  });
});

describe("SECURITY-INTEGRATION-1 · a reconnection is verified again", () => {
  it("SI-4 the node behind the instance's endpoint restarts as a node declaring mainnet: the next send is refused NODE_NETWORK_MISMATCH, no submitTransaction", async () => {
    const A = await startFake("A", "testnet-10");
    let M: Fake | undefined;
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const sdk = await openOn(ws, "testnet-10");
      const detach = coreMod.attachLedgerAppender(ws);
      let r: any;
      let firstConnection: string[] = [];
      let mBeforeSend: string[] = [];
      try {
        await sdk.rpc.getBlockDagInfo(); // the first connection, verified (testnet-10)
        firstConnection = [...A.methods];
        await A.close(); // the node goes away ...
        M = await startFake("M", "mainnet", A.port); // ... and something else answers behind the same URL
        await sleep(5000); // time for the official client to reconnect by itself, if it does
        mBeforeSend = [...M.methods];
        r = await refusal(sdk.tx.send(signed));
      } finally {
        detach();
        await sdk.close?.();
      }
      const seen = { refusal: { code: r.code, message: r.message.slice(0, 300) }, firstConnection, mBeforeSend, mMethods: M!.methods, ...effects(ws, A, M!) };
      trace("SI-4", seen);
      expect(firstConnection, JSON.stringify(seen)).toContain("getServerInfo");
      expect(r.code, JSON.stringify(seen)).toBe("NODE_NETWORK_MISMATCH");
      expect(M!.methods, JSON.stringify(seen)).toContain("getServerInfo");
      expect(M!.methods.filter((m) => m !== "getServerInfo"), JSON.stringify(seen)).toEqual([]);
      expectNoEffects(seen, JSON.stringify(seen));
    } finally {
      await A.close().catch(() => {});
      await M?.close();
    }
  });

  it("SI-4b control: the node restarts as the SAME network: the next send goes through on the new connection, verified again", async () => {
    const A = await startFake("A", "testnet-10");
    let A2: Fake | undefined;
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const sdk = await openOn(ws, "testnet-10");
      let sent: any;
      try {
        await sdk.rpc.getBlockDagInfo();
        await A.close();
        A2 = await startFake("A2", "testnet-10", A.port);
        await sleep(5000);
        sent = await sdk.tx.send(signed);
      } finally {
        await sdk.close?.();
      }
      const seen = { a2Methods: A2!.methods, receiptRpcUrl: sent?.submission?.rpcUrl ?? null };
      trace("SI-4b", seen);
      expect(A2!.methods[0], JSON.stringify(seen)).toBe("getServerInfo");
      expect(A2!.methods, JSON.stringify(seen)).toContain("submitTransaction");
      expect(seen.receiptRpcUrl).toBe(A.url);
    } finally {
      await A.close().catch(() => {});
      await A2?.close();
    }
  });
});

describe("SECURITY-INTEGRATION-1 · artifact network vs instance network at signing", () => {
  it("SI-5 a testnet-10 plan signed on a simnet instance (external signer): what signing does today, and the send refused on both sides", async () => {
    const A = await startFake("A", "testnet-10");
    const S = await startFake("S", "simnet");
    try {
      const ws = workspace(config([{ network: "testnet-10", url: A.url }, { network: "simnet", url: S.url }]));
      const plan = await externalPlanOn(ws);
      const ext = externalSigner();
      const sim = await openOn(ws, "simnet", { signer: ext.signer });
      let signOutcome: any;
      let signed: any;
      let sendOnSimnet: any;
      try {
        try {
          signed = await sim.tx.sign(plan);
          signOutcome = { ok: true, networkId: signed?.networkId };
        } catch (e: any) {
          signOutcome = { ok: false, code: e?.code };
        }
        if (signed) sendOnSimnet = await refusal(sim.tx.send(signed));
      } finally {
        await sim.close?.();
      }
      // the signed testnet-10 artifact on a testnet-10 instance whose endpoint is the simnet node: NNI
      let sendViaSimnetNode: any;
      const tws = moved(ws, config([{ network: "testnet-10", url: S.url }]));
      if (signed) {
        const t = await openOn(tws, "testnet-10");
        try {
          sendViaSimnetNode = await refusal(t.tx.send(signed));
        } finally {
          await t.close?.();
        }
      }
      const onSim = effects(ws, A, S);
      const onT = effects(tws, A, S);
      const seen = {
        signOutcome,
        signerCalls: ext.calls.n,
        sendOnSimnet: sendOnSimnet && { code: sendOnSimnet.code },
        sendViaSimnetNode: sendViaSimnetNode && { code: sendViaSimnetNode.code },
        sMethods: S.methods,
        submitTransaction: onSim.submitTransaction,
        submissionRecords: [...onSim.submissionRecords, ...onT.submissionRecords],
        submissionEvents: [...onSim.submissionEvents, ...onT.submissionEvents]
      };
      trace("SI-5", seen);
      // pinned as it is (no instance check at signing; a decision for review, not part of this integration):
      // the signature is produced for the artifact's own network, then no path sends it on another one
      expect(signOutcome, JSON.stringify(seen)).toEqual({ ok: true, networkId: "testnet-10" });
      expect(seen.sendOnSimnet?.code, JSON.stringify(seen)).toBe("SEND_NETWORK_MISMATCH");
      expect(seen.sendViaSimnetNode?.code, JSON.stringify(seen)).toBe("NODE_NETWORK_MISMATCH");
      expectNoEffects(seen, JSON.stringify(seen));
    } finally {
      await A.close();
      await S.close();
    }
  });
});

describe("SECURITY-INTEGRATION-1 · endpoint credentials never reach receipts, events, errors or the workspace", () => {
  it("SI-6a a send through an endpoint with userinfo and ?token=: the receipt, the events and every workspace file are free of both secrets", async () => {
    const A = await startFake("A", "testnet-10");
    try {
      const ws = workspace(testnetConfig(withSecrets(A)));
      const signed = await signedOn(ws);
      const sdk = await openOn(ws, "testnet-10");
      const detach = coreMod.attachLedgerAppender(ws);
      let sent: any;
      try {
        sent = await sdk.tx.send(signed);
      } finally {
        detach();
        await sdk.close?.();
      }
      const receipt = JSON.stringify(sent ?? null);
      const events = JSON.stringify(ledger(ws));
      const seen = { submitReceived: A.methods.includes("submitTransaction"), receiptRpcUrl: sent?.submission?.rpcUrl ?? null, receiptLeaks: leaks(receipt), eventLeaks: leaks(events), filesLeaking: filesLeaking(ws) };
      trace("SI-6a", seen);
      expect(seen.submitReceived, JSON.stringify(seen)).toBe(true);
      expect(seen.receiptRpcUrl, JSON.stringify(seen)).toContain(`127.0.0.1:${A.port}`);
      expect(seen.receiptLeaks, JSON.stringify(seen)).toEqual([]);
      expect(seen.eventLeaks, JSON.stringify(seen)).toEqual([]);
      expect(seen.filesLeaking, JSON.stringify(seen)).toEqual([]);
    } finally {
      await A.close();
    }
  });

  it("SI-6b refusals on endpoints with credentials (NNI mismatch, EA endpoint mismatch, connection failure): no secret in the error, nothing written", async () => {
    const A = await startFake("A", "testnet-10");
    const M = await startFake("M", "mainnet");
    const gone = await startFake("gone", "testnet-10");
    await gone.close(); // a port nobody listens on any more
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const errors: Record<string, any> = {};
      // NNI: the instance's own endpoint (with credentials) declares mainnet
      const nniWs = moved(ws, testnetConfig(withSecrets(M)));
      let sdk = await openOn(nniWs, "testnet-10");
      try {
        errors.nniRead = await refusal(sdk.rpc.getBlockDagInfo());
        errors.nniSend = await refusal(sdk.tx.send(signed));
      } finally {
        await sdk.close?.();
      }
      // EA: an explicit endpoint with credentials that is not the client's
      sdk = await openOn(ws, "testnet-10");
      try {
        errors.eaSend = await refusal(sdk.tx.send(signed, withSecrets(M)));
      } finally {
        await sdk.close?.();
      }
      // a node that cannot be reached, behind an endpoint with credentials
      const goneWs = moved(ws, testnetConfig(withSecrets(gone)));
      sdk = await openOn(goneWs, "testnet-10");
      try {
        errors.unreachableRead = await refusal(sdk.rpc.getBlockDagInfo());
      } finally {
        await sdk.close?.();
      }
      const all = [ws, nniWs, goneWs].map((w) => effects(w, A, M));
      const seen = {
        codes: Object.fromEntries(Object.entries(errors).map(([k, e]) => [k, e.code ?? null])),
        leaks: Object.fromEntries(Object.entries(errors).map(([k, e]) => [k, leaks(JSON.stringify({ m: e.message, d: e.data ?? null }))])),
        // the messages as evidence, a leaked (synthetic) secret shown by name only
        messages: Object.fromEntries(Object.entries(errors).map(([k, e]) => [k, String(e.message).split(USER_SECRET).join("<USER_SECRET>").split(TOKEN_SECRET).join("<TOKEN_SECRET>").slice(0, 300)])),
        filesLeaking: [ws, nniWs, goneWs].flatMap((w) => filesLeaking(w)),
        submitTransaction: submits(A, M),
        submissionRecords: all.flatMap((e) => e.submissionRecords),
        submissionEvents: all.flatMap((e) => e.submissionEvents)
      };
      trace("SI-6b", seen);
      expect(seen.codes.nniRead, JSON.stringify(seen)).toBe("NODE_NETWORK_MISMATCH");
      expect(seen.codes.nniSend, JSON.stringify(seen)).toBe("NODE_NETWORK_MISMATCH");
      expect(seen.codes.eaSend, JSON.stringify(seen)).toBe("SEND_ENDPOINT_MISMATCH");
      for (const [k, l] of Object.entries(seen.leaks)) expect(l, `${k}: ${JSON.stringify(seen)}`).toEqual([]);
      expect(seen.filesLeaking, JSON.stringify(seen)).toEqual([]);
      expectNoEffects(seen, JSON.stringify(seen));
    } finally {
      await A.close();
      await M.close();
    }
  });

  it("SI-6c CLI tx send --url <endpoint with credentials declaring mainnet>, then a CLI send through a configured endpoint with credentials: no secret in any output or file", async () => {
    const A = await startFake("A", "testnet-10");
    const M = await startFake("M", "mainnet");
    try {
      const ws = workspace(testnetConfig(A.url, CLI_EXTRA));
      await signedOn(ws);
      const refused = await run(["tx", "send", signedFileOf(ws), "--url", withSecrets(M), "--yes", "--json"], ws);
      const afterRefusal = { exit: refused.status, code: refused.doc?.code ?? null, outputLeaks: leaks(refused.stdout + refused.stderr), ...effects(ws, A, M) };
      fs.writeFileSync(path.join(ws, "hardkas.config.ts"), testnetConfig(withSecrets(A), CLI_EXTRA));
      const human = await run(["tx", "send", signedFileOf(ws), "--yes"], ws);
      const seen = {
        afterRefusal,
        accepted: { exit: human.status, submitReceived: A.methods.includes("submitTransaction"), outputLeaks: leaks(human.stdout + human.stderr) },
        filesLeaking: filesLeaking(ws)
      };
      trace("SI-6c", seen);
      expect(afterRefusal.code, refused.brief).toBe("NODE_NETWORK_MISMATCH");
      expect(afterRefusal.outputLeaks, refused.brief).toEqual([]);
      expectNoEffects(afterRefusal, refused.brief);
      expect(seen.accepted.exit, human.brief).toBe(0);
      expect(seen.accepted.submitReceived).toBe(true);
      expect(seen.accepted.outputLeaks, human.brief).toEqual([]);
      expect(seen.filesLeaking, JSON.stringify(seen)).toEqual([]);
    } finally {
      await A.close();
      await M.close();
    }
  });
});

// D1/D3 (review): every refusal OBJECT — message, stack, code, data, metadata, identity, cause — is free of endpoint
// credentials, not only its message; and a send that reached no node (unreachable endpoint with credentials) records
// its failure without them.
/** Everything an error object carries, as text (enumerable fields, non-enumerable message/stack, cause). */
function everything(e: any): string {
  const seen = new Set<unknown>();
  const json = JSON.stringify(e ?? null, (_k, v) => {
    if (typeof v === "bigint") return v.toString();
    if (v && typeof v === "object") {
      if (seen.has(v)) return undefined;
      seen.add(v);
    }
    return v;
  });
  const own = Object.getOwnPropertyNames(e ?? {}).map((n) => {
    try {
      const v = (e as any)[n];
      return typeof v === "object" ? JSON.stringify(v ?? null) : String(v);
    } catch {
      return "";
    }
  });
  return [json, String(e?.message), String(e?.stack), ...own, String(e?.cause?.message ?? ""), JSON.stringify(e?.cause?.data ?? null)].join("\n");
}
async function caught(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  return { code: "(no refusal: the call succeeded)" };
}

describe("SECURITY-INTEGRATION-1 · D3 every refusal object (metadata included) is free of endpoint credentials", () => {
  it("SI-7 NNI, EA (send, observe, simulator), MG, TQ and connection-failure errors: no secret anywhere in the object", async () => {
    const A = await startFake("A", "testnet-10");
    const M = await startFake("M", "mainnet");
    const gone = await startFake("gone", "testnet-10");
    await gone.close();
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const errors: Record<string, any> = {};
      // NNI on the instance's own credentialed endpoint (a node declaring mainnet)
      const nniWs = moved(ws, testnetConfig(withSecrets(M)));
      let sdk = await openOn(nniWs, "testnet-10");
      try {
        errors.nniRead = await caught(sdk.rpc.getBlockDagInfo());
        errors.nniPlan = await caught(sdk.tx.plan({ from: "alice", to: "bob", amount: "1" }));
        errors.nniSend = await caught(sdk.tx.send(signed));
      } finally {
        await sdk.close?.();
      }
      // EA: credentialed explicit endpoints that are not the client's (send and observe)
      sdk = await openOn(ws, "testnet-10");
      try {
        errors.eaSend = await caught(sdk.tx.send(signed, withSecrets(M)));
        errors.eaObserve = await caught(sdk.tx.observe(signed.txId, { rpcUrl: withSecrets(M), maxBatches: 1 }));
        // MG: the same artifact claiming mainnet, on an instance whose own endpoint is credentialed
        errors.mgSend = await caught(sdk.tx.send({ ...signed, networkId: "mainnet" }));
      } finally {
        await sdk.close?.();
      }
      // EA-I4: a simulator instance given a credentialed endpoint
      const simWs = moved(ws, 'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } } };\n');
      sdk = await sdkMod.Hardkas.open({ cwd: simWs, network: "simulated", autoBootstrap: true });
      try {
        errors.eaSimulator = await caught(sdk.tx.send(signed, withSecrets(M)));
      } finally {
        await sdk.close?.();
      }
      // a node that cannot be reached behind a credentialed endpoint: read
      const goneWs = moved(ws, testnetConfig(withSecrets(gone)));
      sdk = await openOn(goneWs, "testnet-10");
      try {
        errors.unreachableRead = await caught(sdk.rpc.getBlockDagInfo());
      } finally {
        await sdk.close?.();
      }
      // TQ-1 authority: a credentialed declared endpoint while the client talks to A
      const tq = await dist("testnet-qualification");
      const rpcMod = await dist("kaspa-rpc");
      const client = new rpcMod.JsonWrpcKaspaClient({ rpcUrl: A.url });
      try {
        errors.tqProbe = await caught(
          tq.probeRemoteTestnet({
            endpoint: { class: "wrpc", address: withSecrets(M) },
            rpc: { endpoint: client.url, getServerInfo: () => client.getServerInfo(), getBlockDagInfo: () => client.getBlockDagInfo() },
            expectedNetworkId: "testnet-10"
          })
        );
      } finally {
        await client.close();
      }
      const seen = {
        codes: Object.fromEntries(Object.entries(errors).map(([k, e]) => [k, e?.reason ?? e?.code ?? null])),
        leaks: Object.fromEntries(Object.entries(errors).map(([k, e]) => [k, leaks(everything(e))])),
        filesLeaking: [ws, nniWs, simWs, goneWs].flatMap((w) => filesLeaking(w)),
        submitTransaction: submits(A, M)
      };
      trace("SI-7", seen);
      expect(seen.codes, JSON.stringify(seen)).toMatchObject({
        nniRead: "NODE_NETWORK_MISMATCH",
        nniPlan: "NODE_NETWORK_MISMATCH",
        nniSend: "NODE_NETWORK_MISMATCH",
        eaSend: "SEND_ENDPOINT_MISMATCH",
        eaObserve: "OBSERVE_ENDPOINT_MISMATCH",
        mgSend: "MAINNET_BROADCAST_DISABLED",
        eaSimulator: "SEND_ENDPOINT_ON_SIMULATOR",
        tqProbe: "ENDPOINT_MISMATCH"
      });
      for (const [k, l] of Object.entries(seen.leaks)) expect(l, `${k}: ${JSON.stringify(seen)}`).toEqual([]);
      expect(seen.filesLeaking, JSON.stringify(seen)).toEqual([]);
      expect(seen.submitTransaction).toEqual({ A: 0, M: 0 });
    } finally {
      await A.close();
      await M.close();
    }
  });

  it("SI-7b a send whose credentialed endpoint is unreachable: refused or recorded as failed, never with a credential (receipt, events, files, error)", async () => {
    const A = await startFake("A", "testnet-10");
    const gone = await startFake("gone", "testnet-10");
    await gone.close();
    try {
      const ws = workspace(testnetConfig(A.url));
      const signed = await signedOn(ws);
      const goneWs = moved(ws, testnetConfig(withSecrets(gone)));
      const sdk = await openOn(goneWs, "testnet-10");
      const detach = coreMod.attachLedgerAppender(goneWs);
      let outcome: any;
      try {
        outcome = await sdk.tx.send(signed).then((v: any) => ({ returned: v }), (e: any) => ({ error: e }));
      } finally {
        detach();
        await sdk.close?.();
      }
      const seen = {
        shape: outcome.error ? { error: outcome.error?.code ?? outcome.error?.name } : { accepted: outcome.returned?.submission?.accepted ?? null },
        resultLeaks: leaks(outcome.error ? everything(outcome.error) : JSON.stringify(outcome.returned ?? null)),
        eventLeaks: leaks(JSON.stringify(ledger(goneWs))),
        filesLeaking: filesLeaking(goneWs)
      };
      trace("SI-7b", seen);
      expect(seen.resultLeaks, JSON.stringify(seen)).toEqual([]);
      expect(seen.eventLeaks, JSON.stringify(seen)).toEqual([]);
      expect(seen.filesLeaking, JSON.stringify(seen)).toEqual([]);
    } finally {
      await A.close();
    }
  });
});
