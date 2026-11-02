import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { Hardkas, PAYMENT_PREFLIGHT_GUARANTEE } from "../src/index.js";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";
import { officialTxIdOf } from "@hardkas/kaspa-rpc";
import { withClientUrl } from "./helpers/rpc-instance.js";
import { FakeNode } from "./helpers/fake-v1-node.js";
import { COUNTER_ADDR, engineSigned, fundingUtxo, genesisBody, sealV1Plan, transitionUtxo, v1CorpusFacts } from "./helpers/v1-corpus.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// PAYMENT-PREFLIGHT-1 · sdk.tx.send(signed, { preflight: true }) for a payment planned and signed by HardKAS (real
// kaspa-wasm signatures) against a loopback stand-in testnet-10 node reached through the real wRPC client. Without the
// option the send is what it was (no extra read, same record). With it, right before the broadcast, the node is asked for
// every input and each signature is verified against the node's UTXO; whatever does not hold refuses the send: nothing
// sent, nothing recorded. Throwaway keys; nothing leaves the machine.
// -----------------------------------------------------------------------------

type Entry = { txid: string; sompi: number; covenantId?: string };
type State = {
  entries: Entry[];
  /** the transactions the node accepted, as they reached it (its mempool: they stay there, their inputs still listed) */
  mempool: unknown[];
  submits: string[];
  utxoReads: number;
  mempoolReads: number;
  failUtxoReads: boolean;
  failMempool: boolean;
};
const DAA = 50_000_000;
const KAS = 100_000_000;
const hashOf = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const PAYER_KEY = hashOf("pp1 sdk payer");
const COVENANT_ID = hashOf("pp1 sdk covenant");
let kaspa: any;
let payer = "";
let payee = "";
const spkHex = (address: string) => {
  const spk = kaspa.payToAddressScript(address);
  return spk.version.toString(16).padStart(4, "0") + (typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex"));
};
const fresh = (): State => ({ entries: [{ txid: hashOf("pp1 sdk utxo"), sompi: 50 * KAS }], mempool: [], submits: [], utxoReads: 0, mempoolReads: 0, failUtxoReads: false, failMempool: false });

type Fake = { url: string; close(): Promise<void> };
async function startFake(state: State): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const sink = hashOf("pp1 sink");
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
          return ok({ p2pId: "pp1", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getSinkBlueScore":
          return ok({ blueScore: DAA });
        case "getFeeEstimate":
          return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
        case "getUtxosByAddresses":
          state.utxoReads += 1;
          if (state.failUtxoReads) return err("the UTXO index is not available");
          return ok({
            entries: (params?.addresses ?? []).flatMap((address: string) =>
              (address === payer ? state.entries : []).map((e) => ({
                address,
                outpoint: { transactionId: e.txid, index: 0 },
                utxoEntry: { amount: e.sompi, scriptPublicKey: spkHex(address), blockDaaScore: DAA - 100_000, isCoinbase: false, ...(e.covenantId ? { covenantId: e.covenantId } : {}) }
              }))
            )
          });
        case "getMempoolEntriesByAddresses":
          state.mempoolReads += 1;
          if (state.failMempool) return err("the mempool cannot be read now");
          return ok({
            entries: (params?.addresses ?? []).map((address: string) => ({
              address,
              // kaspad 2.1.0 JSON: the entry flag is snake_case `is_orphan`; every transaction here spends the payer's UTXOs
              sending: address === payer ? state.mempool.map((transaction) => ({ fee: 1000, is_orphan: false, transaction })) : [],
              receiving: []
            }))
          });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: address === payer ? state.entries.reduce((s, e) => s + e.sompi, 0) : 0 })) });
        case "getMempoolEntry":
          return err(`Transaction ${params?.transactionId} not found`);
        case "submitTransaction": {
          const txId = officialTxIdOf(params?.transaction);
          state.submits.push(txId);
          state.mempool.push(params?.transaction);
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
function workspace(url: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-pp1-sdk-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = {
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
    networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: url } },
    experimental: true,
    network: { allowPublic: true }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg)};\n`);
  return ws;
}
const submissions = (ws: string) => {
  const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
  return (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((f) => /txsubmission/i.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
};
async function outcome(p: Promise<unknown>) {
  try {
    return { result: (await p) as any, error: undefined as any };
  } catch (error: any) {
    return { result: undefined as any, error };
  }
}

/** The payer, a throwaway key held in memory (as the account store would give it). */
const account = () => ({ name: "payer", kind: "kaspa", network: "testnet-10", address: payer, privateKey: PAYER_KEY });

/** A payment planned and signed by HardKAS in its own workspace, against its own stand-in node; the plan is stored. */
async function signedPayment(state: State = fresh()) {
  const fake = await startFake(state);
  fakes.push(fake);
  const ws = workspace(fake.url);
  const sdk: any = await Hardkas.open({ cwd: ws });
  try {
    const plan = await sdk.tx.plan({ from: payer, to: payee, amount: "1" });
    await sdk.artifacts.write(plan);
    const signed = await sdk.tx.sign(plan, { account: account() });
    return { state, fake, ws, plan, signed };
  } finally {
    await sdk.close();
  }
}
async function send(ws: string, signed: any, options?: unknown) {
  const sdk: any = await Hardkas.open({ cwd: ws });
  try {
    return await outcome(sdk.tx.send(signed, options as any));
  } finally {
    await sdk.close();
  }
}

/** A re-sealed copy of a signed artifact with another payload (its txId kept: ids do not cover signature scripts). */
function resealed(signed: any, mutate: (tx: any) => void): any {
  const s: any = structuredClone(signed);
  const tx = JSON.parse(s.signedTransaction.payload);
  mutate(tx);
  s.signedTransaction = { ...s.signedTransaction, payload: JSON.stringify(tx) };
  delete s.contentHash;
  delete s.signedId;
  s.lineage = { ...s.lineage, artifactId: "" };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
  return s;
}

beforeAll(() => {
  kaspa = loadManagedKaspaWasmSync();
  payer = new kaspa.PrivateKey(PAYER_KEY).toPublicKey().toAddress("testnet-10").toString();
  payee = new kaspa.PrivateKey(hashOf("pp1 sdk payee")).toPublicKey().toAddress("testnet-10").toString();
});
afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("PAYMENT-PREFLIGHT-1 · sdk.tx.send with and without the payment preflight", () => {
  it("PP-S1 without the option the send is unchanged (no UTXO or mempool read, no preflight in the record); with it, one check, the same record plus `preflight`", async () => {
    const off = await signedPayment();
    const r0 = { utxo: off.state.utxoReads, mempool: off.state.mempoolReads };
    const plain = await send(off.ws, off.signed, off.fake.url);
    expect(plain.error, String(plain.error?.message)).toBeUndefined();
    expect(plain.result.submitted).toBe(true);
    expect(plain.result.rejection).toBeUndefined();
    expect({ utxo: off.state.utxoReads - r0.utxo, mempool: off.state.mempoolReads - r0.mempool }).toEqual({ utxo: 0, mempool: 0 });
    const [offRecord] = submissions(off.ws);
    expect(offRecord.preflight).toBeUndefined();

    const on = await signedPayment();
    const r1 = { utxo: on.state.utxoReads, mempool: on.state.mempoolReads };
    const checked = await send(on.ws, on.signed, { preflight: true });
    expect(checked.error, String(checked.error?.message)).toBeUndefined();
    expect(checked.result.submitted).toBe(true);
    expect(on.state.submits).toEqual([on.signed.txId]);
    expect({ utxo: on.state.utxoReads - r1.utxo, mempool: on.state.mempoolReads - r1.mempool }).toEqual({ utxo: 1, mempool: 1 });
    const [record] = submissions(on.ws);
    expect(record.preflight).toEqual({ observedAtDaaScore: String(DAA), inputs: on.plan.inputs.length, scope: "observer-local", guarantee: PAYMENT_PREFLIGHT_GUARANTEE });
    expect(Object.keys(record).sort()).toEqual([...Object.keys(offRecord), "preflight"].sort());
    expect({ ...record.fee, planArtifactId: "" }).toEqual({ ...offRecord.fee, planArtifactId: "" });
  });

  it("PP-S2 a signature byte changed (same txid): refused with the check (INPUT_SIGNATURE_INVALID, nothing sent or recorded); without it (the default, unchanged) it is broadcast and only the node could refuse it", async () => {
    const p = await signedPayment();
    const bad = resealed(p.signed, (tx) => {
      const s: string = tx.inputs[0].signatureScript;
      tx.inputs[0].signatureScript = s.slice(0, 40) + (s[40] === "0" ? "1" : "0") + s.slice(41);
    });
    expect(bad.txId).toBe(p.signed.txId);
    const checked = await send(p.ws, bad, { preflight: true });
    expect(checked.error?.code).toBe("INPUT_SIGNATURE_INVALID");
    expect(checked.error?.message).toMatch(/Nothing was sent or recorded/);
    expect(p.state.submits).toEqual([]);
    expect(submissions(p.ws)).toEqual([]);
    const plain = await send(p.ws, bad, p.fake.url);
    expect(plain.error, String(plain.error?.message)).toBeUndefined();
    expect(p.state.submits).toEqual([p.signed.txId]);
  });

  it("PP-S3 the node changed after signing: spent, a covenant's UTXO, another amount, cannot list, cannot read its mempool — each refused with its code; nothing sent or recorded", async () => {
    const cases: Array<[string, (s: State) => void, string]> = [
      ["spent", (s) => (s.entries = []), "INPUT_NOT_UNSPENT"],
      ["covenant", (s) => (s.entries = [{ ...s.entries[0]!, covenantId: COVENANT_ID }]), "COVENANT_UTXO_NOT_PAYMENT_INPUT"],
      ["amount", (s) => (s.entries = [{ ...s.entries[0]!, sompi: s.entries[0]!.sompi + 1 }]), "INPUT_DIFFERS_FROM_NODE"],
      ["no index", (s) => (s.failUtxoReads = true), "PREFLIGHT_NODE_UNAVAILABLE"],
      ["no mempool", (s) => (s.failMempool = true), "PENDING_SPEND_EVIDENCE_UNAVAILABLE"]
    ];
    for (const [name, arrange, code] of cases) {
      const p = await signedPayment();
      arrange(p.state);
      const r = await send(p.ws, p.signed, { preflight: true });
      expect(r.error?.code, name).toBe(code);
      expect(r.error?.message, name).toMatch(/Nothing was sent or recorded/);
      expect(p.state.submits, name).toEqual([]);
      expect(submissions(p.ws), name).toEqual([]);
    }
  });

  it("PP-S3b another payment of the same input reached the node first and waits in its mempool (the input still listed): INPUT_PENDING_SPEND; nothing more sent or recorded", async () => {
    const p = await signedPayment();
    const sdk: any = await Hardkas.open({ cwd: p.ws });
    let competing: any;
    try {
      const plan = await sdk.tx.plan({ from: payer, to: payee, amount: "2" });
      await sdk.artifacts.write(plan);
      competing = await sdk.tx.sign(plan, { account: account() });
    } finally {
      await sdk.close();
    }
    expect(competing.txId).not.toBe(p.signed.txId);
    expect((await send(p.ws, competing, p.fake.url)).result?.submitted).toBe(true);
    const r = await send(p.ws, p.signed, { preflight: true });
    expect(r.error?.code, String(r.error?.message)).toBe("INPUT_PENDING_SPEND");
    expect(p.state.submits).toEqual([competing.txId]);
    expect(submissions(p.ws)).toHaveLength(1);
  });

  it("PP-S4 asked for wrongly or where it cannot run: a non-boolean, a plan not in the workspace, the simulator — refused before anything is sent", async () => {
    const p = await signedPayment();
    expect((await send(p.ws, p.signed, { preflight: "yes" })).error?.code).toBe("SEND_OPTION_INVALID");
    // without its verified plan the check could not tell where the inputs are; the strict verification every real send
    // runs first already refuses a plan named but absent, and a signed artifact naming none (SEND_PREFLIGHT_PLAN_UNRESOLVED
    // stays behind them, fail closed)
    const elsewhere = workspace(p.fake.url);
    const absent = await send(elsewhere, p.signed, { preflight: true });
    expect(String(absent.error?.message)).toMatch(/parent_plan_unresolved/);
    const orphan = resealed(p.signed, () => {});
    delete orphan.lineage.parentArtifactId;
    const unnamed = await send(p.ws, resealed(orphan, () => {}), { preflight: true });
    expect(String(unnamed.error?.message)).toMatch(/corrupted or invalid/);
    const simulator = fs.mkdtempSync(path.join(os.tmpdir(), "hk-pp1-sim-"));
    made.push(simulator);
    expect((await send(simulator, p.signed, { preflight: true })).error?.code).toBe("SEND_PREFLIGHT_ON_SIMULATOR");
    expect(p.state.submits).toEqual([]);
    expect(submissions(p.ws)).toEqual([]);
    expect(submissions(elsewhere)).toEqual([]);
  });

  it("PP-S5 the same payment sent again with the check: the recorded submission stands (TX-SEND-IDEMPOTENT-1), no second check, no second broadcast", async () => {
    const p = await signedPayment();
    expect((await send(p.ws, p.signed, { preflight: true })).result?.submitted).toBe(true);
    const reads = p.state.utxoReads;
    const again = await send(p.ws, p.signed, { preflight: true });
    expect(again.error?.code === "TX_ALREADY_SUBMITTED" || again.result?.alreadySubmitted === true, String(again.error?.message)).toBe(true);
    expect(p.state.submits).toEqual([p.signed.txId]);
    expect(p.state.utxoReads).toBe(reads);
    expect(submissions(p.ws)).toHaveLength(1);
  });
});

describe("PAYMENT-PREFLIGHT-1 · a v1 engine transaction keeps its own check", () => {
  afterEach(() => vi.restoreAllMocks());

  it("PP-S6 preflight on a v1 engine transaction: SEND_PREFLIGHT_NOT_APPLICABLE before anything is sent; without it, its own check (F1.6) runs as before", async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-pp1-v1-"));
    made.push(ws);
    fs.mkdirSync(path.join(ws, ".hardkas"));
    const node = new FakeNode();
    node.utxos = [transitionUtxo(), fundingUtxo()];
    const sdk: any = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simnet" });
    const cfg: any = sdk.config.config;
    cfg.networks = { ...(cfg.networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async (address: any) => node.listed(address) as any);
    vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockImplementation(async (o: any) => node.mempoolEntries(o.addresses) as any);
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockImplementation(async () => ({ networkId: node.networkId, virtualDaaScore: node.virtualDaaScore, tipHashes: [node.sink], virtualParentHashes: [node.sink], sink: node.sink }) as any);
    vi.spyOn(sdk.rpc, "getServerInfo").mockImplementation(async () => ({ networkId: node.networkId, serverVersion: "2.1.0", isSynced: true }) as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockImplementation(async () => ({ blueScore: node.sinkBlueScore.toString() }) as any);
    vi.spyOn(sdk.rpc, "call").mockImplementation(async (method: string, params: any) => node.call(method, params));
    vi.spyOn(sdk.rpc, "submitTransaction").mockImplementation(async (transaction: any) => node.submit(transaction));
    withClientUrl(sdk, "http://127.0.0.1:16110");
    const { plan, signed, txId } = await engineSigned(sealV1Plan(genesisBody(), COUNTER_ADDR), fundingUtxo());
    await sdk.artifacts.write(plan);
    const refused = await outcome(sdk.tx.send(signed, { url: "http://127.0.0.1:16110", v1Facts: v1CorpusFacts(), preflight: true }));
    expect(refused.error?.code).toBe("SEND_PREFLIGHT_NOT_APPLICABLE");
    expect(node.submits).toEqual([]);
    const sent = await outcome(sdk.tx.send(signed, { url: "http://127.0.0.1:16110", v1Facts: v1CorpusFacts() }));
    expect(sent.error, String(sent.error?.message)).toBeUndefined();
    expect(node.submits).toEqual([txId]);
    expect(submissions(ws)[0].preflight.guarantee).toMatch(/local-orchestration-only/);
  });
});
