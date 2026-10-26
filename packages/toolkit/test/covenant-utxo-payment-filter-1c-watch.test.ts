import { describe, it, expect, vi } from "vitest";

// -----------------------------------------------------------------------------
// COVENANT-UTXO-PAYMENT-FILTER-1C (F1.0-ter, 2026-10-25). WalletToolkit.watch() lists the observed UTXOs from kaspa-wasm's
// UtxoContext; a UTXO of a covenant keeps its covenant id there (kaspa-wasm puts it on the reference's `entry`), so a
// caller that plans from the watch can leave it out. A fake kaspa-wasm stands in for RpcClient / UtxoProcessor /
// UtxoContext, as in wallet-watch-utxocontext.test.ts.
// -----------------------------------------------------------------------------

const fake = vi.hoisted(() => {
  const COVENANT_ID = "c0".repeat(32);
  // kaspa-wasm 2.1.0: a UtxoEntryReference carries the covenant id on its `entry` (UtxoEntry.covenantId, a Hash)
  const reference = (txid: string, amount: bigint, covenantId?: string) => ({
    outpoint: { transactionId: txid, index: 0 },
    amount,
    isCoinbase: false,
    blockDaaScore: 1n,
    entry: { covenantId: covenantId === undefined ? undefined : { toString: () => covenantId } }
  });
  const node = [reference("a1".repeat(32), 100n, COVENANT_ID), reference("b2".repeat(32), 50n)];
  class RpcClient {
    constructor(public args: any) {}
    async connect() {}
    async disconnect() {}
    async getServerInfo() { return { networkId: "simnet", isSynced: true, serverVersion: "fake", hasUtxoIndex: true }; }
    addEventListener() {}
    removeEventListener() {}
  }
  class UtxoProcessor {
    listeners: Array<(e: any) => void> = [];
    constructor(public args: any) {}
    addEventListener(a: any, b?: any) { this.listeners.push(typeof a === "function" ? a : (e: any) => { if (e.type === a) b(e); }); }
    removeEventListener() {}
    async start() {}
    async stop() {}
  }
  class UtxoContext {
    mature: any[] = [];
    constructor(public args: any) {}
    async clear() { this.mature = []; }
    async trackAddresses() { this.mature = [...node]; }
    async unregisterAddresses() {}
    getMatureRange(from: number, to: number) { return this.mature.slice(from, to); }
    getPending() { return []; }
    get matureLength() { return this.mature.length; }
    get balance() { return { mature: this.mature.reduce((s, e) => s + e.amount, 0n), pending: 0n, outgoing: 0n }; }
  }
  return { k: { RpcClient, UtxoProcessor, UtxoContext, Encoding: { SerdeJson: 1 } }, COVENANT_ID };
});

vi.mock("@hardkas/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hardkas/core")>()),
  loadManagedKaspaWasmSync: () => fake.k
}));

import { WalletToolkit } from "../src/wallet.js";

describe("COVENANT-UTXO-PAYMENT-FILTER-1C · watch() keeps the covenant id", () => {
  it("CC-K5: handle.utxos() lists the covenant's UTXO with its covenant id, the ordinary one without", async () => {
    const wallet = WalletToolkit.open("cuf1c-watch", { rpcUrl: "ws://127.0.0.1:1", storePath: "mem://cuf1c-watch" });
    vi.spyOn(wallet, "receive").mockResolvedValue("kaspasim:qwatched");
    const handle = await wallet.watch(() => {});
    try {
      const utxos: any[] = handle.utxos();
      expect(utxos.find((u) => u.transactionId === "a1".repeat(32))?.covenantId).toBe(fake.COVENANT_ID);
      const ordinary = utxos.find((u) => u.transactionId === "b2".repeat(32));
      expect(ordinary).toBeDefined();
      expect("covenantId" in ordinary).toBe(false);
    } finally {
      await handle.unwatch();
    }
  });
});
