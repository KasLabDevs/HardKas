import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { Hardkas } from "../src/index.js";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION, createLineageTransition } from "@hardkas/artifacts";
import { officialTxIdOf } from "@hardkas/kaspa-rpc";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// HK-11 / CA-TX-02 · a real send is bound to the plan that authorized it; HK-09 / CA-TX-01 / TX-05 · the SDK plan pays the
// relay minimum, bounds the node's rate and always has a fee limit. A loopback stand-in testnet-10 node reached through
// the real wRPC client; HardKAS plans and signs with kaspa-wasm (throwaway keys); nothing leaves the machine.
// Counter-audit evidence: X3-03-rootform.log (a root-form signed artifact passes strict verification and would be sent
// without its plan), X3-02-tx.log (fees).
// -----------------------------------------------------------------------------

type State = { entries: Array<{ txid: string; sompi: number }>; submits: string[]; feeEstimate: unknown };
const DAA = 50_000_000;
const KAS = 100_000_000;
const hashOf = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const PAYER_KEY = hashOf("hk11 payer");
let kaspa: any;
let payer = "";
let payee = "";
const spkHex = (address: string) => {
  const spk = kaspa.payToAddressScript(address);
  return spk.version.toString(16).padStart(4, "0") + (typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex"));
};
const minimumEstimate = { estimate: { priorityBucket: { feerate: 100, estimatedSeconds: 1 }, normalBuckets: [{ feerate: 100, estimatedSeconds: 1 }], lowBuckets: [{ feerate: 100, estimatedSeconds: 1 }] } };
const fresh = (feeEstimate: unknown = minimumEstimate): State => ({ entries: [{ txid: hashOf("hk11 utxo"), sompi: 50 * KAS }], submits: [], feeEstimate });

type Fake = { url: string; close(): Promise<void> };
async function startFake(state: State): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const sink = hashOf("hk11 sink");
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try { params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params; } catch { params = undefined; }
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":1,"message":${JSON.stringify(message)}}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "testnet-10", hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getBlockDagInfo":
          return ok({ network: "testnet-10", blockCount: 10, headerCount: 10, tipHashes: [sink], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [sink], pruningPointHash: hashOf("pp"), virtualDaaScore: DAA, sink });
        case "getBlock":
          return ok({ block: { header: { hash: sink, blueScore: DAA - 10, daaScore: DAA }, transactions: [] } });
        case "getInfo":
          return ok({ p2pId: "hk11", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getSinkBlueScore":
          return ok({ blueScore: DAA });
        case "getFeeEstimate":
          return ok(state.feeEstimate);
        case "getUtxosByAddresses":
          return ok({
            entries: (params?.addresses ?? []).flatMap((address: string) =>
              (address === payer ? state.entries : []).map((e) => ({
                address,
                outpoint: { transactionId: e.txid, index: 0 },
                utxoEntry: { amount: e.sompi, scriptPublicKey: spkHex(address), blockDaaScore: DAA - 100_000, isCoinbase: false }
              }))
            )
          });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, sending: [], receiving: [] })) });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: address === payer ? 50 * KAS : 0 })) });
        case "getMempoolEntry":
          return err(`Transaction ${params?.transactionId} not found`);
        case "submitTransaction": {
          const txId = officialTxIdOf(params?.transaction);
          state.submits.push(txId);
          return ok({ transactionId: txId });
        }
        default:
          return err(`fake does not implement ${method}`);
      }
    });
  });
  const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, close: () => new Promise<void>((r) => { for (const c of server.clients) c.terminate(); server.close(() => r()); }) };
}

const made: string[] = [];
const fakes: Fake[] = [];
function workspace(url: string, extraNetwork: Record<string, unknown> = {}): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-hk11-sdk-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = {
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
    networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: url, ...extraNetwork } },
    experimental: true,
    network: { allowPublic: true }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg)};\n`);
  return ws;
}
async function outcome<T>(p: Promise<T>) {
  try {
    return { result: (await p) as any, error: undefined as any };
  } catch (error: any) {
    return { result: undefined as any, error };
  }
}
const account = () => ({ name: "payer", kind: "kaspa", network: "testnet-10", address: payer, privateKey: PAYER_KEY });

async function opened<T>(ws: string, f: (sdk: any) => Promise<T>): Promise<T> {
  const sdk: any = await Hardkas.open({ cwd: ws });
  try {
    return await f(sdk);
  } finally {
    await sdk.close();
  }
}

async function signedPayment(state: State = fresh(), amount = "1") {
  const fake = await startFake(state);
  fakes.push(fake);
  const ws = workspace(fake.url);
  const { plan, signed } = await opened(ws, async (sdk) => {
    const plan = await sdk.tx.plan({ from: payer, to: payee, amount });
    await sdk.artifacts.write(plan);
    const signed = await sdk.tx.sign(plan, { account: account() });
    return { plan, signed };
  });
  return { state, fake, ws, plan, signed };
}

/** Re-sealed with another lineage (X3-03 root form, or another parent). */
function relineaged(signed: any, lineage: (s: any) => any): any {
  const s: any = structuredClone(signed);
  delete s.contentHash;
  delete s.signedId;
  s.lineage = lineage(s);
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
  return s;
}

beforeAll(() => {
  kaspa = loadManagedKaspaWasmSync();
  payer = new kaspa.PrivateKey(PAYER_KEY).toPublicKey().toAddress("testnet-10").toString();
  payee = new kaspa.PrivateKey(hashOf("hk11 payee")).toPublicKey().toAddress("testnet-10").toString();
});
afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("HK-11 · a real send is bound to its plan", () => {
  it("control: the plan → sign → send flow broadcasts", async () => {
    const p = await signedPayment();
    const r = await opened(p.ws, (sdk) => outcome(sdk.tx.send(p.signed, p.fake.url)));
    expect(r.error, String(r.error?.message)).toBeUndefined();
    expect(p.state.submits).toEqual([p.signed.txId]);
  });

  it("X3-03 root form (lineage { artifactId } only, well formed): SEND_PLAN_UNRESOLVED by default, nothing sent; broadcast only with allowUnplannedSignedTransaction", async () => {
    const p = await signedPayment();
    const root = relineaged(p.signed, () => ({ artifactId: "" }));
    const verified = await opened(p.ws, (sdk) => sdk.artifacts.verify(root, { strict: true, throwOnInvalid: false, enforceMetadata: false }));
    expect(verified.valid, JSON.stringify(verified)).toBe(true); // the strict verification alone does not refuse it
    const refused = await opened(p.ws, (sdk) => outcome(sdk.tx.send(root, p.fake.url)));
    expect(refused.error?.code).toBe("SEND_PLAN_UNRESOLVED");
    expect(refused.error?.message).toMatch(/Nothing was sent or recorded/);
    expect(p.state.submits).toEqual([]);
    const wrongType = await opened(p.ws, (sdk) => outcome(sdk.tx.send(root, { url: p.fake.url, allowUnplannedSignedTransaction: "yes" })));
    expect(wrongType.error?.code).toBe("SEND_OPTION_INVALID");
    const withPreflight = await opened(p.ws, (sdk) => outcome(sdk.tx.send(root, { url: p.fake.url, preflight: true, allowUnplannedSignedTransaction: true })));
    expect(withPreflight.error?.code).toBe("SEND_PREFLIGHT_PLAN_UNRESOLVED");
    const allowed = await opened(p.ws, (sdk) => outcome(sdk.tx.send(root, { url: p.fake.url, allowUnplannedSignedTransaction: true })));
    expect(allowed.error, String(allowed.error?.message)).toBeUndefined();
    expect(p.state.submits).toEqual([p.signed.txId]);
    expect(allowed.result.submission?.fee?.status ?? allowed.result.receipt?.fee?.status).toBe("insufficient-evidence");
  });

  it("CA-TX-02 a parent that is another signed transaction of the store (not a plan): SEND_PARENT_NOT_PLAN, even with the escape", async () => {
    const p = await signedPayment();
    await opened(p.ws, (sdk) => sdk.artifacts.write(p.signed));
    const child = relineaged(p.signed, () => createLineageTransition(p.signed, "hardkas.signedTx"));
    expect(child.lineage.parentArtifactId).toBe(p.signed.contentHash);
    for (const options of [p.fake.url, { url: p.fake.url, allowUnplannedSignedTransaction: true }]) {
      const r = await opened(p.ws, (sdk) => outcome(sdk.tx.send(child, options)));
      expect(r.error?.code, String(r.error?.message)).toBe("SEND_PARENT_NOT_PLAN");
    }
    expect(p.state.submits).toEqual([]);
  });

  it("a named plan that is not in this workspace: SEND_PLAN_UNRESOLVED (no longer a generic 'parent_plan_unresolved')", async () => {
    const p = await signedPayment();
    const elsewhere = workspace(p.fake.url);
    const r = await opened(elsewhere, (sdk) => outcome(sdk.tx.send(p.signed, p.fake.url)));
    expect(r.error?.code).toBe("SEND_PLAN_UNRESOLVED");
    expect(p.state.submits).toEqual([]);
  });

  it("sdk.artifacts.verify({ strict: true }) passes `strict` to the integrity check: a hashVersion-3 artifact is MIGRATION_REQUIRED", async () => {
    const p = await signedPayment();
    const legacy: any = structuredClone(p.signed);
    legacy.hashVersion = 3;
    delete legacy.contentHash;
    delete legacy.signedId;
    const h = calculateContentHash(legacy, 3);
    legacy.contentHash = h;
    legacy.lineage = { artifactId: h, lineageId: h, rootArtifactId: h };
    const loose = await opened(p.ws, (sdk) => sdk.artifacts.verify(legacy, { strict: false, throwOnInvalid: false, enforceMetadata: false }));
    const strict = await opened(p.ws, (sdk) => sdk.artifacts.verify(legacy, { strict: true, throwOnInvalid: false, enforceMetadata: false }));
    expect(loose.valid).toBe(true);
    expect(strict.valid).toBe(false);
    expect(strict.reason).toBe("migration_required");
  });
});

describe("HK-09 / CA-TX-01 / TX-05 · the SDK plan's fee", () => {
  it("0.2 KAS and 1 KAS with the node at the minimum: the plan pays the relay minimum (203,600), not 5,000,000 / 1,000,000", async () => {
    for (const amount of ["0.2", "1"]) {
      const p = await signedPayment(fresh(), amount);
      expect(BigInt(p.plan.estimatedFeeSompi), amount).toBe(203_600n);
    }
  });

  it("the node's estimate is read in its real shape: a normal bucket of 300 sompi/g plans at 300 (priority)", async () => {
    const est = { estimate: { priorityBucket: { feerate: 900, estimatedSeconds: 1 }, normalBuckets: [{ feerate: 300, estimatedSeconds: 5 }], lowBuckets: [{ feerate: 100, estimatedSeconds: 60 }] } };
    const p = await signedPayment(fresh(est), "10");
    const fee = BigInt(p.plan.estimatedFeeSompi);
    const mass = BigInt(p.plan.estimatedMass);
    expect(fee).toBeGreaterThan(203_600n);
    expect(fee).toBeLessThanOrEqual(300n * mass);
    expect(fee).toBeGreaterThanOrEqual(300n * (mass - 10n));
  });

  it("a node rate of 1e6 sompi/g: FEE_RATE_ABOVE_BOUND, nothing planned (never 500 KAS of fee)", async () => {
    const huge = { estimate: { priorityBucket: { feerate: 1e6, estimatedSeconds: 1 }, normalBuckets: [{ feerate: 1e6, estimatedSeconds: 1 }], lowBuckets: [{ feerate: 1e6, estimatedSeconds: 1 }] } };
    const fake = await startFake(fresh(huge));
    fakes.push(fake);
    const ws = workspace(fake.url);
    const r = await opened(ws, (sdk) => outcome(sdk.tx.plan({ from: payer, to: payee, amount: "0.2" })));
    expect(r.error?.code).toBe("FEE_RATE_ABOVE_BOUND");
  });

  it("no limit configured: the default limit (0.1 KAS) refuses an explicit rate that would pay 2.5 KAS for 0.2 KAS; a configured limit replaces it", async () => {
    const fake = await startFake(fresh());
    fakes.push(fake);
    const ws = workspace(fake.url);
    const r = await opened(ws, (sdk) => outcome(sdk.tx.plan({ from: payer, to: payee, amount: "0.2", feeRate: 5000n })));
    expect(r.error?.code).toBe("FEE_EXCEEDS_MAX");
    expect(r.error?.message).toMatch(/default limit/);
    const raised = workspace(fake.url, { maxFeeSompi: "300000000" });
    const ok = await opened(raised, (sdk) => outcome(sdk.tx.plan({ from: payer, to: payee, amount: "0.2", feeRate: 5000n })));
    expect(ok.error, String(ok.error?.message)).toBeUndefined();
    expect(BigInt(ok.result.estimatedFeeSompi)).toBeGreaterThan(100_000_000n);
  });
});
