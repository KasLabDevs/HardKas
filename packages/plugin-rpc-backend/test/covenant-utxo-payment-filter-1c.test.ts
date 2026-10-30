import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { kaspaRpcBackendPlugin } from "../src/index.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// -----------------------------------------------------------------------------
// COVENANT-UTXO-PAYMENT-FILTER-1C (F1.0-ter, 2026-10-25). The RPC backend plugin in its HTTP mode (an http(s):// URL:
// `KaspaJsonRpcClient`, the official client on the node's wRPC JSON endpoint) hands on the covenant id the node lists
// for a UTXO, as its ws:// mode already did. Loopback fake node; nothing is signed or sent.
// -----------------------------------------------------------------------------

const hashOf = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const COVENANT_ID = hashOf("covenant-utxo-payment-filter-1c covenant");
const COVENANT_TX = hashOf("cuf1c covenant utxo");
const ORDINARY_TX = hashOf("cuf1c ordinary utxo");
const DAA = 50_000_000;
let kaspa: any;
let address = "";

type Node = { port: number; close(): Promise<void> };
async function startNode(): Promise<Node> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const spk = kaspa.payToAddressScript(address);
  const spkHex = spk.version.toString(16).padStart(4, "0") + (typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex"));
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      switch (method) {
        case "getInfo":
          return ok({ p2pId: "cuf1c", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "simnet", hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getBlockDagInfo":
          return ok({ network: "simnet", blockCount: 10, headerCount: 10, tipHashes: [hashOf("sink")], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [hashOf("sink")], pruningPointHash: hashOf("pp"), virtualDaaScore: DAA, sink: hashOf("sink") });
        case "getUtxosByAddresses": {
          const entry = (txid: string, sompi: number, covenantId?: string) => ({
            address,
            outpoint: { transactionId: txid, index: 0 },
            utxoEntry: { amount: sompi, scriptPublicKey: spkHex, blockDaaScore: DAA - 1_000, isCoinbase: false, ...(covenantId ? { covenantId } : {}) }
          });
          return ok({ entries: [entry(COVENANT_TX, 100 * 1e8, COVENANT_ID), entry(ORDINARY_TX, 50 * 1e8)] });
        }
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
beforeAll(async () => {
  kaspa = loadManagedKaspaWasmSync();
  address = new kaspa.PrivateKey(hashOf("cuf1c owner")).toKeypair().toAddress("simnet").toString();
  node = await startNode();
});
afterAll(async () => {
  await node?.close();
});

const outpointOf = (e: any): string => e?.outpoint?.transactionId;
/** The covenant id an entry carries, wherever the plugin's mode puts it (flat, or in the node's `utxoEntry`). */
const covenantOf = (e: any): string | undefined => e?.covenantId ?? e?.utxoEntry?.covenantId;

async function utxosThrough(url: string): Promise<any[]> {
  const plugin = kaspaRpcBackendPlugin({ url, resilience: { maxRetries: 0 } });
  await plugin.connect!();
  try {
    return await plugin.utxos!(address);
  } finally {
    await plugin.disconnect!();
  }
}

describe("COVENANT-UTXO-PAYMENT-FILTER-1C · the RPC backend plugin hands on the covenant id", () => {
  it("CC-P1: HTTP mode (http:// URL): the covenant's UTXO carries its id, the ordinary one none", async () => {
    const entries = await utxosThrough(`http://127.0.0.1:${node.port}`);
    const covenant = entries.find((e) => outpointOf(e) === COVENANT_TX);
    const ordinary = entries.find((e) => outpointOf(e) === ORDINARY_TX);
    expect(covenant).toBeDefined();
    expect(ordinary).toBeDefined();
    expect(covenantOf(covenant)).toBe(COVENANT_ID);
    expect(covenantOf(ordinary)).toBeUndefined();
  });

  it("CC-P2 (control): ws:// mode, the same node: the same id", async () => {
    const entries = await utxosThrough(`ws://127.0.0.1:${node.port}`);
    expect(covenantOf(entries.find((e) => outpointOf(e) === COVENANT_TX))).toBe(COVENANT_ID);
    expect(covenantOf(entries.find((e) => outpointOf(e) === ORDINARY_TX))).toBeUndefined();
  });
});
