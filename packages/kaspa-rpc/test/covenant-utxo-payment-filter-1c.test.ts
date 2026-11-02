import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { KaspaJsonRpcClient } from "../src/json-rpc-client.js";
import { JsonWrpcKaspaClient } from "../src/index.js";
import { fakeOfficialRpc } from "./helpers/fake-official-rpc.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// -----------------------------------------------------------------------------
// COVENANT-UTXO-PAYMENT-FILTER-1C (F1.0-ter, 2026-10-25). A UTXO the node lists with a covenant id (KIP-20) keeps it
// through `KaspaJsonRpcClient`, the client behind an http(s):// endpoint (the plugin-rpc-backend HTTP mode): the id is
// what lets every payment path leave the covenant's UTXO out. Loopback fake wRPC JSON node, the pinned official client;
// nothing is signed or sent.
// -----------------------------------------------------------------------------

const hashOf = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const COVENANT_ID = hashOf("covenant-utxo-payment-filter-1c covenant");
const COVENANT_TX = hashOf("cuf1c covenant utxo");
const ORDINARY_TX = hashOf("cuf1c ordinary utxo");
const DAA = 50_000_000;
let kaspa: any;
let address = "";

type Node = { httpUrl: string; wsUrl: string; close(): Promise<void> };
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
      if (method === "getServerInfo") {
        return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: "simnet", hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
      }
      if (method === "getUtxosByAddresses") {
        const entry = (txid: string, sompi: number, covenantId?: string) => ({
          address,
          outpoint: { transactionId: txid, index: 0 },
          utxoEntry: { amount: sompi, scriptPublicKey: spkHex, blockDaaScore: DAA - 1_000, isCoinbase: false, ...(covenantId ? { covenantId } : {}) }
        });
        return ok({ entries: [entry(COVENANT_TX, 100 * 1e8, COVENANT_ID), entry(ORDINARY_TX, 50 * 1e8)] });
      }
      socket.send(`{"id":${id},"error":{"code":1,"message":"fake node does not implement ${method}"}}`);
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    httpUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}`,
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

const byTx = (utxos: Array<{ outpoint: { transactionId: string } }>) => Object.fromEntries(utxos.map((u) => [u.outpoint.transactionId, u as any]));

describe("COVENANT-UTXO-PAYMENT-FILTER-1C · KaspaJsonRpcClient keeps the covenant id", () => {
  it("CC-R1: over an http:// endpoint (the official client on the node's wRPC JSON), a covenant's UTXO keeps its id; an ordinary one has none", async () => {
    const client = new KaspaJsonRpcClient({ url: node.httpUrl, retry: { maxRetries: 0 } });
    try {
      const utxos = byTx(await client.getUtxosByAddress(address));
      expect(Object.keys(utxos).sort()).toEqual([COVENANT_TX, ORDINARY_TX].sort());
      expect(utxos[COVENANT_TX].covenantId).toBe(COVENANT_ID);
      expect(utxos[COVENANT_TX].amountSompi).toBe(100n * 100_000_000n);
      expect("covenantId" in utxos[ORDINARY_TX]).toBe(false);
    } finally {
      await client.close();
    }
  });

  it("CC-R2: an answer that spells it covenant_id (snake case) is kept too, as covenantId", async () => {
    const rpc = fakeOfficialRpc({
      getUtxosByAddresses: () => ({
        entries: [
          {
            address,
            outpoint: { transactionId: COVENANT_TX, index: 0 },
            utxoEntry: { amount: 5n, scriptPublicKey: "0000aa", blockDaaScore: 1n, isCoinbase: false, covenant_id: COVENANT_ID }
          }
        ]
      })
    });
    const client = new KaspaJsonRpcClient({ url: "http://localhost:18210", rpcFactory: rpc.factory, retry: { maxRetries: 0 } });
    const [utxo] = await client.getUtxosByAddress(address);
    expect(utxo!.covenantId).toBe(COVENANT_ID);
  });

  it("CC-R3 (control): the SDK's client (JsonWrpcKaspaClient) lists the same id from the same node", async () => {
    const client = new JsonWrpcKaspaClient({ rpcUrl: node.wsUrl, timeoutMs: 20_000 });
    try {
      const utxos = byTx(await client.getUtxosByAddress(address));
      expect(utxos[COVENANT_TX].covenantId).toBe(COVENANT_ID);
      expect(utxos[ORDINARY_TX].covenantId).toBeUndefined();
    } finally {
      await client.close();
    }
  });
});
