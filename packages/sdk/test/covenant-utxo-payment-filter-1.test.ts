import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { Hardkas } from "../src/index.js";
import { loadManagedKaspaWasmSync } from "@hardkas/core";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// COVENANT-UTXO-PAYMENT-FILTER-1 (2026-10-25), through the SDK. The node lists a covenant's UTXO (KIP-20 covenant id)
// at the payer's address next to ordinary ones. `tx.plan` used to copy the UTXOs into new objects without the covenant
// id, so the planner could not see it and the pinned Generator spent it, ending the covenant. A plan now spends only the
// ordinary UTXOs; with none, it is refused; a consolidation handed a covenant UTXO is refused. Loopback fake testnet-10
// node, throwaway addresses, nothing signed or sent.
// -----------------------------------------------------------------------------

type Entry = { txid: string; sompi: number; covenantId?: string };
const DAA = 50_000_000;
const KAS = 100_000_000;
const hashOf = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const COVENANT_ID = hashOf("covenant-utxo-payment-filter-1 covenant");
let kaspa: any;
let payer = "";
let payee = "";
const spkHex = (address: string) => {
  const spk = kaspa.payToAddressScript(address);
  return spk.version.toString(16).padStart(4, "0") + (typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex"));
};

type Fake = { url: string; methods: string[]; close(): Promise<void> };
async function startFake(utxosOf: (address: string) => Entry[]): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const fake: Fake = { url: "", methods: [], close: async () => {} };
  const sink = hashOf("sink");
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try { params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params; } catch { params = undefined; }
      fake.methods.push(method);
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":1,"message":${JSON.stringify(message)}}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "testnet-10", hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getBlockDagInfo":
          return ok({ network: "testnet-10", blockCount: 10, headerCount: 10, tipHashes: [sink], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [sink], pruningPointHash: hashOf("pp"), virtualDaaScore: DAA, sink });
        case "getInfo":
          return ok({ p2pId: "cuf1", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getSinkBlueScore":
          return ok({ blueScore: DAA });
        case "getFeeEstimate":
          return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
        case "getUtxosByAddresses":
          return ok({
            entries: (params?.addresses ?? []).flatMap((address: string) =>
              utxosOf(address).map((e) => ({
                address,
                outpoint: { transactionId: e.txid, index: 0 },
                utxoEntry: { amount: e.sompi, scriptPublicKey: spkHex(address), blockDaaScore: DAA - 100_000, isCoinbase: false, ...(e.covenantId ? { covenantId: e.covenantId } : {}) }
              }))
            )
          });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, sending: [], receiving: [] })) });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: utxosOf(address).reduce((s, e) => s + e.sompi, 0) })) });
        default:
          return err(`fake does not implement ${method}`);
      }
    });
  });
  fake.url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.close = () => new Promise<void>((r) => { for (const c of server.clients) c.terminate(); server.close(() => r()); });
  return fake;
}

const made: string[] = [];
const fakes: Fake[] = [];
function workspace(url: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cuf1-sdk-"));
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
async function withSdk<T>(entries: Entry[], fn: (sdk: Hardkas) => Promise<T>): Promise<T> {
  const fake = await startFake((address) => (address === payer ? entries : []));
  fakes.push(fake);
  const sdk = await Hardkas.open({ cwd: workspace(fake.url) });
  try {
    return await fn(sdk);
  } finally {
    await sdk.close();
  }
}

beforeAll(() => {
  kaspa = loadManagedKaspaWasmSync();
  payer = new kaspa.PrivateKey(hashOf("cuf1 payer")).toPublicKey().toAddress("testnet-10").toString();
  payee = new kaspa.PrivateKey(hashOf("cuf1 payee")).toPublicKey().toAddress("testnet-10").toString();
});
afterAll(async () => {
  for (const f of fakes) await f.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const COVENANT: Entry = { txid: hashOf("covenant utxo"), sompi: 100 * KAS, covenantId: COVENANT_ID };
const ORDINARY: Entry = { txid: hashOf("ordinary utxo"), sompi: 50 * KAS };

describe("COVENANT-UTXO-PAYMENT-FILTER-1 · SDK", () => {
  it("CS-1 mixed: tx.plan spends the ordinary UTXO, never the covenant's one listed first", async () => {
    const plan: any = await withSdk([COVENANT, ORDINARY], (sdk) => sdk.tx.plan({ from: payer, to: payee, amount: "1" } as any));
    expect(plan.inputs.map((i: any) => i.outpoint.transactionId)).toEqual([ORDINARY.txid]);
    expect(plan.inputs.some((i: any) => i.covenantId)).toBe(false);
  });

  it("CS-2 covenant UTXOs only: tx.plan is refused (insufficient funds, the exclusion named)", async () => {
    await expect(withSdk([COVENANT], (sdk) => sdk.tx.plan({ from: payer, to: payee, amount: "1" } as any))).rejects.toThrow(/covenant/i);
  });

  it("CS-3 control, ordinary UTXOs only: tx.plan spends them as before", async () => {
    const plan: any = await withSdk([ORDINARY], (sdk) => sdk.tx.plan({ from: payer, to: payee, amount: "1" } as any));
    expect(plan.inputs.map((i: any) => i.outpoint.transactionId)).toEqual([ORDINARY.txid]);
  });

  it("CS-4 a consolidation handed a covenant UTXO is refused (COVENANT_UTXO_NOT_PAYMENT_INPUT)", async () => {
    const asUtxo = (e: Entry) => ({ outpoint: { transactionId: e.txid, index: 0 }, address: payer, amountSompi: BigInt(e.sompi), scriptPublicKey: spkHex(payer).slice(4), blockDaaScore: BigInt(DAA - 100_000), isCoinbase: false, ...(e.covenantId ? { covenantId: e.covenantId } : {}) });
    await expect(
      withSdk([], (sdk) =>
        sdk.tx.createConsolidationPlan({ account: { name: "payer", kind: "kaspa", network: "testnet-10", address: payer } as any, selectedUtxos: [asUtxo(ORDINARY), asUtxo(COVENANT)], destination: payer })
      )
    ).rejects.toMatchObject({ code: "COVENANT_UTXO_NOT_PAYMENT_INPUT" });
  });
});
