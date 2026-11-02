import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { Hardkas } from "../src/index.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// COVENANT-UTXO-PAYMENT-FILTER-1C (F1.0-ter, 2026-10-25), through the SDK's wallet facade (`sdk.wallet.open`). The SDK's
// client lists a UTXO's covenant id; the wallet it opens maps the UTXOs for its planners and used to drop the id, so a
// payment could spend the covenant's UTXO. Now the id survives: the payment leaves it out and a sweep refuses it, before
// the instance's signer is asked. Loopback fake simnet node; the signer records and signs nothing; nothing is sent.
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
type Node = { url: string; close(): Promise<void> };
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
    url: `ws://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((r) => { for (const c of server.clients) c.terminate(); server.close(() => r()); })
  };
}

let node: Node;
const made: string[] = [];
beforeAll(async () => {
  kaspa = loadManagedKaspaWasmSync();
  payee = new kaspa.PrivateKey(hashOf("cuf1c payee")).toKeypair().toAddress("simnet").toString();
  node = await startNode();
});
afterAll(async () => {
  await node?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

/** An SDK instance on the fake simnet node, with a signer that records what it is asked and signs nothing. */
async function sdkWallet(entries: Entry[]) {
  state.entries = entries;
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cuf1c-sdk-"));
  made.push(cwd);
  fs.mkdirSync(path.join(cwd, ".hardkas"));
  fs.writeFileSync(path.join(cwd, "hardkas.config.ts"), `export default { networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "${node.url}" } } };\n`);
  const asked: any[] = [];
  const signer = {
    async signTransaction(artifact: any) {
      asked.push(artifact);
      throw Object.assign(new Error("CUF1C_SIGNER_ASKED: the test signer signs nothing"), { code: "CUF1C_SIGNER_ASKED" });
    }
  };
  const sdk = await Hardkas.open({ cwd, network: "simnet", signer } as any);
  const w = sdk.wallet.open("cuf1c", { storePath: path.join(cwd, "wallet.json") } as any);
  await w.create();
  return { sdk, w, asked };
}
const inputsOf = (plan: any): string[] => (plan?.inputs ?? []).map((i: any) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
const settle = <T>(p: Promise<T>) => p.then((value) => ({ value, error: undefined as any }), (error) => ({ value: undefined as T | undefined, error }));

describe("COVENANT-UTXO-PAYMENT-FILTER-1C · sdk.wallet.open keeps the covenant id", () => {
  it("CC-W1: the SDK wallet's UTXO list keeps the covenant id its node lists", async () => {
    const { sdk, w } = await sdkWallet([COVENANT, ORDINARY]);
    try {
      const list: any[] = await w.utxos.list();
      expect(list.find((u) => u.transactionId === COVENANT.txid)?.covenantId).toBe(COVENANT_ID);
      expect(list.find((u) => u.transactionId === ORDINARY.txid)?.covenantId).toBeUndefined();
    } finally {
      await sdk.close();
    }
  });

  it("CC-W2: send() leaves the covenant's UTXO out and the signer is asked for the ordinary one only", async () => {
    const { sdk, w, asked } = await sdkWallet([COVENANT, ORDINARY]);
    try {
      const r = await settle(w.send({ to: payee, amount: 1n * KAS, feeRate: 1n }));
      expect(r.error?.code).toBe("CUF1C_SIGNER_ASKED");
      expect(asked).toHaveLength(1);
      expect(inputsOf(asked[0])).toEqual([`${ORDINARY.txid}:0`]);
    } finally {
      await sdk.close();
    }
  });

  it("CC-W3: sweep() is refused before the signer is asked", async () => {
    const { sdk, w, asked } = await sdkWallet([COVENANT, ORDINARY]);
    try {
      const r = await settle(w.sweep({ to: payee, feeRate: 1n }));
      expect(r.error?.code).toBe("COVENANT_UTXO_NOT_PAYMENT_INPUT");
      expect(asked).toHaveLength(0);
    } finally {
      await sdk.close();
    }
  });
});
