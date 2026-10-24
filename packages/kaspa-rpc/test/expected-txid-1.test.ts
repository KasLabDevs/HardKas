import { describe, it, expect, vi } from "vitest";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { KaspaJsonRpcClient } from "../src/json-rpc-client.js";
import { JsonWrpcKaspaClient } from "../src/index.js";
import { KaspaWrpcClient } from "../src/wrpc-client.js";
import { LoadBalancedRpcProvider } from "../src/provider.js";
import { isRpcRequestNotSentError } from "../src/errors.js";
import { fakeOfficialRpc, nodeError } from "./helpers/fake-official-rpc.js";

// EXPECTED-TXID-1 (owner brief 2026-10-19). A signed transaction reaches the RPC clients as the signer's JSON text, which
// carries no id: the client cannot tell which transaction the node's answer is about, nor which one to name when the
// outcome is unknown. The caller now hands the signed artifact's TXID in (`options.expectedTxId`); before anything is sent
// the client checks that id against the transaction it is about to send, computed by the official kaspa-wasm. An answer
// naming no transaction or another one, or a failure after the request may have left, is an UNKNOWN outcome that keeps
// the expected TXID. An RPC answer is never a consensus confirmation. In-process stand-ins only: no network.

// KaspaWrpcClient's requests time out after its fixed 5 s (the "hang" case waits for it)
vi.setConfig({ testTimeout: 15_000 });

const url = "http://localhost:16110";
const SPK = "20" + "aa".repeat(32) + "ac";
const SUBNET = "0000000000000000000000000000000000000000";
const PREV = { transactionId: "cd".repeat(32), index: 0 };
const SIG = "41" + "bb".repeat(65);

/** The transaction as the official kaspa-wasm builds it: its id is the reference, not anything HardKAS computes. */
const k: any = loadManagedKaspaWasmSync();
const OFFICIAL_ID = String(
  new k.Transaction({
    version: 0,
    inputs: [{ previousOutpoint: PREV, signatureScript: SIG, sequence: 0n, sigOpCount: 1 }],
    outputs: [{ value: 900000n, scriptPublicKey: new k.ScriptPublicKey(0, SPK) }],
    lockTime: 0n,
    subnetworkId: SUBNET,
    gas: 0n,
    payload: ""
  }).id
);
/** The same transaction as a signer hands it to sdk.tx.send: JSON text, no id field. */
const SIGNED_JSON = JSON.stringify({
  version: 0,
  inputs: [{ previousOutpoint: PREV, signatureScript: SIG, sequence: "0", sigOpCount: 1 }],
  outputs: [{ value: "900000", scriptPublicKey: { version: 0, scriptPublicKey: SPK } }],
  lockTime: "0",
  subnetworkId: SUBNET,
  gas: "0",
  payload: "",
  storageMass: "0"
});
const OTHER_ID = "ef".repeat(32);
const identified = { getServerInfo: () => ({ networkId: "simnet" }), getBlockDagInfo: () => ({ network: "simnet" }) };

/** A node that RECEIVES every submission it is handed, then answers as `answer` says. */
function node(answer: "ok" | "other-id" | "empty" | "hang" | "lost" | "reject") {
  const received: any[] = [];
  const rpc = fakeOfficialRpc({
    ...identified,
    submitTransaction: (req: any) => {
      received.push(req);
      switch (answer) {
        case "ok": return { transactionId: OFFICIAL_ID };
        case "other-id": return { transactionId: OTHER_ID };
        case "empty": return {};
        case "hang": return new Promise(() => {});
        case "lost": throw new Error("WebSocket is not connected");
        case "reject": throw nodeError(`Rejected transaction ${OFFICIAL_ID}: transaction ${OFFICIAL_ID} is not standard: x`);
      }
    }
  });
  return { rpc, received };
}

const jsonRpc = (rpc: ReturnType<typeof fakeOfficialRpc>, extra: Record<string, unknown> = {}) =>
  new KaspaJsonRpcClient({ url, rpcFactory: rpc.factory, timeoutMs: 60, retry: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 2 }, ...extra } as any);
const jsonWrpc = (rpc: ReturnType<typeof fakeOfficialRpc>) => new JsonWrpcKaspaClient({ rpcUrl: url, rpcFactory: rpc.factory, timeoutMs: 60 } as any);
async function wrpc(rpc: ReturnType<typeof fakeOfficialRpc>) {
  const c = new KaspaWrpcClient("ws://127.0.0.1:17110", { rpcFactory: rpc.factory, timeoutMs: 60 } as any);
  await c.connect();
  return c;
}

async function outcome(p: Promise<unknown>) {
  try {
    return { result: await p as any, error: undefined as any };
  } catch (error: any) {
    return { result: undefined as any, error };
  }
}

const CLIENTS = [
  ["KaspaJsonRpcClient", async (rpc: ReturnType<typeof fakeOfficialRpc>) => jsonRpc(rpc)],
  ["JsonWrpcKaspaClient", async (rpc: ReturnType<typeof fakeOfficialRpc>) => jsonWrpc(rpc)],
  ["KaspaWrpcClient", wrpc]
] as const;

describe("EXPECTED-TXID-1 · the clients know the signed transaction's TXID and check the node's answer against it", () => {
  it("control: the reference id is the official kaspa-wasm id, a 64-hex string", () => {
    expect(OFFICIAL_ID).toMatch(/^[0-9a-f]{64}$/);
  });

  for (const [name, make] of CLIENTS) {
    describe(name, () => {
      it("the correct TXID → accepted with that id, one submission", async () => {
        const n = node("ok");
        const r = await outcome((await make(n.rpc)).submitTransaction(SIGNED_JSON as any, { expectedTxId: OFFICIAL_ID } as any));
        expect(r.error).toBeUndefined();
        expect(r.result?.transactionId).toBe(OFFICIAL_ID);
        expect(n.received).toHaveLength(1);
      });

      it("the node names ANOTHER transaction → unknown, keeping the expected TXID (never a success)", async () => {
        const n = node("other-id");
        const r = await outcome((await make(n.rpc)).submitTransaction(SIGNED_JSON as any, { expectedTxId: OFFICIAL_ID } as any));
        expect(r.result?.accepted === true || typeof r.result?.transactionId === "string").toBe(false);
        expect(r.error?.code).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
        expect(r.error?.txId).toBe(OFFICIAL_ID);
        expect(n.received).toHaveLength(1);
      });

      it("an empty answer → unknown, keeping the expected TXID", async () => {
        const n = node("empty");
        const r = await outcome((await make(n.rpc)).submitTransaction(SIGNED_JSON as any, { expectedTxId: OFFICIAL_ID } as any));
        expect(r.error?.code).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
        expect(r.error?.txId).toBe(OFFICIAL_ID);
      });

      it("the answer is lost after the request left (timeout) → unknown, keeping the expected TXID, sent once", async () => {
        const n = node("hang");
        const r = await outcome((await make(n.rpc)).submitTransaction(SIGNED_JSON as any, { expectedTxId: OFFICIAL_ID } as any));
        expect(r.error?.code).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
        expect(r.error?.txId).toBe(OFFICIAL_ID);
        expect(isRpcRequestNotSentError(r.error)).toBe(false);
        expect(n.received).toHaveLength(1);
      });

      it("the connection drops after the request left → unknown, keeping the expected TXID", async () => {
        const n = node("lost");
        const r = await outcome((await make(n.rpc)).submitTransaction(SIGNED_JSON as any, { expectedTxId: OFFICIAL_ID } as any));
        expect(r.error?.code).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
        expect(r.error?.txId).toBe(OFFICIAL_ID);
      });

      it("an expected TXID that is not the transaction's official id → refused before anything is sent (typed not-sent)", async () => {
        const n = node("ok");
        const r = await outcome((await make(n.rpc)).submitTransaction(SIGNED_JSON as any, { expectedTxId: OTHER_ID } as any));
        expect(n.received).toHaveLength(0);
        expect(isRpcRequestNotSentError(r.error)).toBe(true);
        expect(r.error?.code).toBe("RPC_EXPECTED_TXID_MISMATCH");
      });

      it("a malformed expected TXID → refused before anything is sent", async () => {
        const n = node("ok");
        const r = await outcome((await make(n.rpc)).submitTransaction(SIGNED_JSON as any, { expectedTxId: "not-a-txid" } as any));
        expect(n.received).toHaveLength(0);
        expect(isRpcRequestNotSentError(r.error)).toBe(true);
        expect(r.error?.code).toBe("RPC_EXPECTED_TXID_INVALID");
      });

      it("the node's own rejection keeps its text (not unknown, not rewritten)", async () => {
        const n = node("reject");
        const r = await outcome((await make(n.rpc)).submitTransaction(SIGNED_JSON as any, { expectedTxId: OFFICIAL_ID } as any));
        expect(r.error?.message).toMatch(/^Rejected transaction .*is not standard/);
        expect(n.received).toHaveLength(1);
      });
    });
  }

  it("KaspaWrpcClient: an options object is not read as allowOrphan (the node is asked with allowOrphan: false)", async () => {
    const n = node("ok");
    await (await wrpc(n.rpc)).submitTransaction(SIGNED_JSON as any, { expectedTxId: OFFICIAL_ID } as any);
    expect(n.received[0]?.allowOrphan).toBe(false);
  });

  it("KaspaWrpcClient: the legacy boolean allowOrphan argument still works", async () => {
    const n = node("ok");
    await (await wrpc(n.rpc)).submitTransaction(SIGNED_JSON as any, true);
    expect(n.received[0]?.allowOrphan).toBe(true);
  });

  it("proven failure before emitting (no connection) stays typed not-sent, zero submissions", async () => {
    const down = fakeOfficialRpc({ ...identified, submitTransaction: () => ({ transactionId: OFFICIAL_ID }) }, { connectError: new Error("Unable to connect") });
    const r = await outcome(jsonRpc(down).submitTransaction(SIGNED_JSON as any, { expectedTxId: OFFICIAL_ID } as any));
    expect(down.calls.filter((c) => c.method === "submitTransaction")).toHaveLength(0);
    expect(isRpcRequestNotSentError(r.error)).toBe(true);
  });

  it("LoadBalancedRpcProvider hands the expected TXID through; a different answer is unknown and node B is not tried", async () => {
    const a = node("other-id");
    const b = node("ok");
    const r = await outcome(new LoadBalancedRpcProvider([jsonRpc(a.rpc), jsonRpc(b.rpc)]).submitTransaction(SIGNED_JSON as any, { expectedTxId: OFFICIAL_ID } as any));
    expect(r.error?.code).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
    expect(r.error?.txId).toBe(OFFICIAL_ID);
    expect(a.received).toHaveLength(1);
    expect(b.received).toHaveLength(0);
  });

  it("LoadBalancedRpcProvider: A proven not-sent → B tried once with the same expected TXID, accepted", async () => {
    const down = fakeOfficialRpc({ ...identified, submitTransaction: () => ({ transactionId: OFFICIAL_ID }) }, { connectError: new Error("Unable to connect") });
    const b = node("ok");
    const r = await outcome(new LoadBalancedRpcProvider([jsonRpc(down), jsonRpc(b.rpc)]).submitTransaction(SIGNED_JSON as any, { expectedTxId: OFFICIAL_ID } as any));
    expect(r.result?.transactionId).toBe(OFFICIAL_ID);
    expect(b.received).toHaveLength(1);
  });

  it("control: read-only calls keep their retries (two failures, then success)", async () => {
    let calls = 0;
    const rpc = fakeOfficialRpc({ getBlockDagInfo: () => { calls++; if (calls < 3) throw new Error("socket hang up"); return { network: "simnet", virtualDaaScore: 1 }; } });
    const r = await outcome(jsonRpc(rpc).getBlockDagInfo());
    expect(r.error).toBeUndefined();
    expect(calls).toBe(3);
  });
});
