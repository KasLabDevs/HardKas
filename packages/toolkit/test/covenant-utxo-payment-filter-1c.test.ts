import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { KaspaJsonRpcClient } from "@hardkas/kaspa-rpc";
import { WalletToolkit } from "../src/index.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// COVENANT-UTXO-PAYMENT-FILTER-1C (F1.0-ter, 2026-10-25). WalletToolkit reads its UTXOs through the RPC client it is
// given and maps them for its planners: the covenant id the node lists survives that mapping, so a payment leaves the
// covenant's UTXO out and a sweep refuses it, before any signer is asked. The client here is `KaspaJsonRpcClient` on an
// http:// endpoint (the HTTP mode); the SDK's own client takes the same mapping (sdk test of the same name). Loopback
// fake simnet node; the real kaspa-wasm Generator plans; the signer only records what it is asked; nothing is sent.
// -----------------------------------------------------------------------------

type Entry = { txid: string; sompi: number; covenantId?: string };
const DAA = 50_000_000;
const KAS = 100_000_000n;
const hashOf = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const COVENANT_ID = hashOf("covenant-utxo-payment-filter-1c covenant");
const COVENANT: Entry = { txid: hashOf("cuf1c covenant utxo"), sompi: 100 * 1e8, covenantId: COVENANT_ID };
const ORDINARY: Entry = { txid: hashOf("cuf1c ordinary utxo"), sompi: 50 * 1e8 };
let kaspa: any;
let payee = "";

const state = { entries: [] as Entry[] };
type Node = { port: number; close(): Promise<void> };
async function startNode(): Promise<Node> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const sink = hashOf("sink");
  const spkHex = (address: string) => {
    const spk = kaspa.payToAddressScript(address);
    return spk.version.toString(16).padStart(4, "0") + (typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex"));
  };
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try { params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params; } catch { params = undefined; }
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      switch (method) {
        case "getInfo":
          return ok({ p2pId: "cuf1c", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "simnet", hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getBlockDagInfo":
          return ok({ network: "simnet", blockCount: 10, headerCount: 10, tipHashes: [sink], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [sink], pruningPointHash: hashOf("pp"), virtualDaaScore: DAA, sink });
        case "getUtxosByAddresses":
          return ok({
            entries: (params?.addresses ?? []).flatMap((address: string) =>
              state.entries.map((e) => ({
                address,
                outpoint: { transactionId: e.txid, index: 0 },
                utxoEntry: { amount: e.sompi, scriptPublicKey: spkHex(address), blockDaaScore: DAA - 100_000, isCoinbase: false, ...(e.covenantId ? { covenantId: e.covenantId } : {}) }
              }))
            )
          });
        default:
          return socket.send(`{"id":${id},"error":{"code":1,"message":"fake node does not implement ${method}"}}`);
      }
    });
  });
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise<void>((r) => { for (const c of server.clients) c.terminate(); server.close(() => r()); })
  };
}

let node: Node;
let tmp = "";
beforeAll(async () => {
  kaspa = loadManagedKaspaWasmSync();
  payee = new kaspa.PrivateKey(hashOf("cuf1c payee")).toKeypair().toAddress("simnet").toString();
  node = await startNode();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cuf1c-toolkit-"));
});
afterAll(async () => {
  await node?.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

/** A simnet wallet on the HTTP-mode client; its signer records the plan it is asked to sign and signs nothing. */
let n = 0;
async function walletOn(entries: Entry[]) {
  state.entries = entries;
  const rpc = new KaspaJsonRpcClient({ url: `http://127.0.0.1:${node.port}`, retry: { maxRetries: 0 } });
  const signer = {
    plans: [] as any[],
    async signTxPlan({ planArtifact }: { planArtifact: any }) {
      signer.plans.push(planArtifact);
      throw Object.assign(new Error("CUF1C_SIGNER_ASKED: the test signer signs nothing"), { code: "CUF1C_SIGNER_ASKED" });
    }
  };
  const w = WalletToolkit.open(`cuf1c-${++n}`, { storePath: path.join(tmp, `w${n}.json`), networkId: "simnet", rpc, signer, coinbaseMaturity: 100n });
  await w.create();
  return { w, rpc, signer };
}
const inputsOf = (plan: any): string[] => (plan?.inputs ?? []).map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
const settle = <T>(p: Promise<T>) => p.then((value) => ({ value, error: undefined as any }), (error) => ({ value: undefined as T | undefined, error }));

describe("COVENANT-UTXO-PAYMENT-FILTER-1C · WalletToolkit over the HTTP-mode client", () => {
  it("CC-K1: the wallet's UTXO list keeps the covenant id the node lists", async () => {
    const { w, rpc } = await walletOn([COVENANT, ORDINARY]);
    try {
      const list: any[] = await w.utxos.list();
      const covenant = list.find((u) => u.transactionId === COVENANT.txid);
      const ordinary = list.find((u) => u.transactionId === ORDINARY.txid);
      expect(covenant?.covenantId).toBe(COVENANT_ID);
      expect(ordinary).toBeDefined();
      expect(ordinary.covenantId).toBeUndefined();
    } finally {
      await rpc.close();
    }
  });

  it("CC-K2: a payment leaves the covenant's UTXO out (listed first and larger) and pays from the ordinary one", async () => {
    const { w, rpc, signer } = await walletOn([COVENANT, ORDINARY]);
    try {
      const r = await settle(w.send({ to: payee, amount: 1n * KAS, feeRate: 1n }));
      expect(r.error?.code).toBe("CUF1C_SIGNER_ASKED");
      expect(signer.plans).toHaveLength(1);
      expect(inputsOf(signer.plans[0])).not.toContain(`${COVENANT.txid}:0`);
      expect(inputsOf(signer.plans[0])).toEqual([`${ORDINARY.txid}:0`]);
    } finally {
      await rpc.close();
    }
  });

  it("CC-K3: a sweep that would take the covenant's UTXO is refused before the signer is asked", async () => {
    const { w, rpc, signer } = await walletOn([COVENANT, ORDINARY]);
    try {
      const r = await settle(w.sweep({ to: payee, feeRate: 1n }));
      expect(r.error?.code).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
      expect(signer.plans).toHaveLength(0);
    } finally {
      await rpc.close();
    }
  });

  it("CC-K4 (control): with no covenant UTXO listed, the payment is planned and handed to the signer as before", async () => {
    const { w, rpc, signer } = await walletOn([ORDINARY]);
    try {
      const r = await settle(w.send({ to: payee, amount: 1n * KAS, feeRate: 1n }));
      expect(r.error?.code).toBe("CUF1C_SIGNER_ASKED");
      expect(inputsOf(signer.plans[0])).toEqual([`${ORDINARY.txid}:0`]);
    } finally {
      await rpc.close();
    }
  });
});
