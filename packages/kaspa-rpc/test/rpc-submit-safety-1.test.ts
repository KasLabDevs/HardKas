import { describe, it, expect } from "vitest";
import { KaspaJsonRpcClient } from "../src/json-rpc-client.js";
import { JsonWrpcKaspaClient } from "../src/index.js";
import { LoadBalancedRpcProvider } from "../src/provider.js";
import { isRpcRequestNotSentError } from "../src/errors.js";
import { fakeOfficialRpc, nodeError } from "./helpers/fake-official-rpc.js";

// RPC-SUBMIT-SAFETY-1 (owner brief 2026-10-19). An RPC operation that can put a transaction on the network is made
// ONCE: no automatic retry and no failover after a potentially transmitted attempt. A failure after the request may have
// left is an UNKNOWN outcome (never "rejected", never "not sent"); "not sent" only when it certainly never left. Read-only
// calls keep their resilience. In-process stand-ins for the official client only: no network.

const url = "http://localhost:16110";
const TXID = "ab".repeat(32);
const identified = { getServerInfo: () => ({ networkId: "simnet" }), getBlockDagInfo: () => ({ network: "simnet" }) };
const tx = (id?: string) => ({
  ...(id ? { id } : {}),
  version: 1,
  inputs: [{ previousOutpoint: { transactionId: "cd".repeat(32), index: 0 }, signatureScript: "00", sequence: 0, sigOpCount: 0, computeBudget: 10 }],
  outputs: [{ amount: "1000", scriptPublicKey: { version: 0, scriptPublicKey: "51" } }],
  lockTime: 0,
  subnetworkId: "0000000000000000000000000000000000000000",
  gas: 0,
  payload: "",
  storageMass: 1234
});

/** A node that RECEIVES every submission it is handed (it has the transaction), then answers as `answer` says. */
function node(answer: "ok" | "hang" | "lost" | "mempool" | "accepted-already" | "reject" | "empty" | "other-id") {
  const received: unknown[] = [];
  const rpc = fakeOfficialRpc({
    ...identified,
    submitTransaction: (req: any) => {
      received.push(req);
      switch (answer) {
        case "ok": return { transactionId: TXID };
        case "hang": return new Promise(() => {}); // accepted; the answer never comes (timeout)
        case "lost": throw new Error("WebSocket is not connected"); // accepted; the connection drops before the answer
        case "mempool": throw nodeError(`Rejected transaction ${TXID}: transaction ${TXID} is already in the mempool`);
        case "accepted-already": throw nodeError(`Rejected transaction ${TXID}: transaction ${TXID} was already accepted by the consensus`);
        case "reject": throw nodeError(`Rejected transaction ${TXID}: transaction ${TXID} is not standard: x`);
        case "empty": return {};
        case "other-id": return { transactionId: "ef".repeat(32) };
      }
    }
  });
  return { rpc, received };
}

const client = (rpc: ReturnType<typeof fakeOfficialRpc>, extra: Record<string, unknown> = {}) =>
  new KaspaJsonRpcClient({ url, rpcFactory: rpc.factory, timeoutMs: 60, retry: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 2 }, ...extra } as any);

async function outcome(p: Promise<unknown>) {
  try {
    return { result: await p, error: undefined as any };
  } catch (error: any) {
    return { result: undefined, error };
  }
}

describe("RPC-SUBMIT-SAFETY-1 · KaspaJsonRpcClient sends a transaction once", () => {
  it("accepted, then the answer times out → ONE submission, outcome unknown (never retried)", async () => {
    const n = node("hang");
    const r = await outcome(client(n.rpc).submitTransaction(tx(TXID)));
    expect(n.received).toHaveLength(1);
    expect(r.error?.code).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
    expect(r.error?.txId).toBe(TXID);
    expect(r.error?.message).toMatch(/did not re-submit it and tried no other node/);
    expect(isRpcRequestNotSentError(r.error)).toBe(false);
  });

  it("accepted, then the connection drops before the answer → ONE submission, outcome unknown", async () => {
    const n = node("lost");
    const r = await outcome(client(n.rpc).submitTransaction(tx(TXID)));
    expect(n.received).toHaveLength(1);
    expect(r.error?.code).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
  });

  it("the node goes away while the submission is in flight → ONE submission, outcome unknown", async () => {
    const received: unknown[] = [];
    const rpc = fakeOfficialRpc({
      ...identified,
      submitTransaction: (req: any) => {
        received.push(req);
        rpc.drop();
        throw new Error("WebSocket is not connected");
      }
    });
    const r = await outcome(client(rpc).submitTransaction(tx(TXID)));
    expect(received).toHaveLength(1);
    expect(r.error?.code).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
  });

  it("no connection can be opened (certainly not sent) → typed not-sent, zero submissions, one connection attempt", async () => {
    const rpc = fakeOfficialRpc({ ...identified, submitTransaction: () => ({ transactionId: TXID }) }, { connectError: new Error("Unable to connect") });
    const r = await outcome(client(rpc).submitTransaction(tx(TXID)));
    expect(rpc.calls.filter((c) => c.method === "submitTransaction")).toHaveLength(0);
    expect(isRpcRequestNotSentError(r.error)).toBe(true);
    expect(r.error?.code).not.toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
    expect(rpc.connects).toBe(1);
  });

  it("circuit breaker already open → refused before anything is sent, typed as not sent", async () => {
    const n = node("ok");
    const flaky = fakeOfficialRpc({ ...identified, getInfo: () => { throw new Error("WebSocket is not connected"); }, submitTransaction: (req: any) => { n.received.push(req); return { transactionId: TXID }; } });
    const c = client(flaky, { retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1 }, circuitBreaker: { failureThreshold: 1, resetTimeoutMs: 60_000 } });
    await outcome(c.getInfo());
    const r = await outcome(c.submitTransaction(tx(TXID)));
    expect(n.received).toHaveLength(0);
    expect(r.error?.name).toBe("RpcCircuitOpenError");
    expect(isRpcRequestNotSentError(r.error)).toBe(true);
  });

  it("'already in the mempool' / 'already accepted' → ONE submission, the node's text kept (never retried, never rewritten)", async () => {
    for (const a of ["mempool", "accepted-already"] as const) {
      const n = node(a);
      const r = await outcome(client(n.rpc).submitTransaction(tx(TXID)));
      expect(n.received).toHaveLength(1);
      expect(r.error?.message).toMatch(/^Rejected transaction .*already/);
      expect(isRpcRequestNotSentError(r.error)).toBe(false);
    }
  });

  it("a deterministic rejection → ONE submission, the node's rejection text kept", async () => {
    const n = node("reject");
    const r = await outcome(client(n.rpc).submitTransaction(tx(TXID)));
    expect(n.received).toHaveLength(1);
    expect(r.error?.message).toMatch(/^Rejected transaction .*is not standard/);
  });

  it("an empty answer, or another transaction's id, is never a success", async () => {
    const empty = node("empty");
    const a = await outcome(client(empty.rpc).submitTransaction(tx(TXID)));
    expect(a.result).toBeUndefined();
    expect(a.error?.code).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
    const other = node("other-id");
    const b = await outcome(client(other.rpc).submitTransaction(tx(TXID)));
    expect(b.result).toBeUndefined();
    expect(b.error?.code).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
  });

  it("the generic call() of a broadcast method follows the same single-attempt rule", async () => {
    for (const method of ["submitTransaction", "submitTransactionRequest", "submitTransactionReplacement"]) {
      const received: unknown[] = [];
      const rpc = fakeOfficialRpc({ ...identified, submitTransaction: (r: any) => { received.push(r); return new Promise(() => {}); }, submitTransactionReplacement: (r: any) => { received.push(r); return new Promise(() => {}); } });
      const r = await outcome(client(rpc).call(method, { transaction: tx(TXID) }));
      expect(received, method).toHaveLength(1);
      expect(r.error?.code, method).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
    }
  });

  it("control: an accepted submission returns the node's id", async () => {
    const n = node("ok");
    expect(await client(n.rpc).submitTransaction(tx(TXID))).toEqual({ transactionId: TXID });
    expect(n.received).toHaveLength(1);
  });

  it("control: read-only calls keep their retries (two failures, then success)", async () => {
    let calls = 0;
    const rpc = fakeOfficialRpc({ getBlockDagInfo: () => { calls++; if (calls < 3) throw new Error("socket hang up"); return { network: "simnet", virtualDaaScore: 1 }; } });
    const r = await outcome(client(rpc).getBlockDagInfo());
    expect(r.error).toBeUndefined();
    expect(calls).toBe(3);
  });
});

describe("RPC-SUBMIT-SAFETY-1 · LoadBalancedRpcProvider never fails a broadcast over after it may have been sent", () => {
  it("node A accepts and the answer times out → node B is NOT tried; outcome unknown", async () => {
    const a = node("hang");
    const b = node("ok");
    const p = new LoadBalancedRpcProvider([client(a.rpc), client(b.rpc)]);
    const r = await outcome(p.submitTransaction(tx(TXID) as any));
    expect(a.received).toHaveLength(1);
    expect(b.received).toHaveLength(0);
    expect(r.error?.code).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
  });

  it("nodes that would disagree (A has it, B would say 'already in the mempool') → only A is asked", async () => {
    const a = node("lost");
    const b = node("mempool");
    const r = await outcome(new LoadBalancedRpcProvider([client(a.rpc), client(b.rpc)]).submitTransaction(tx(TXID) as any));
    expect(b.received).toHaveLength(0);
    expect(r.error?.code).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
  });

  it("a rejection by A is final: B is not tried", async () => {
    const a = node("reject");
    const b = node("ok");
    const r = await outcome(new LoadBalancedRpcProvider([client(a.rpc), client(b.rpc)]).submitTransaction(tx(TXID) as any));
    expect(b.received).toHaveLength(0);
    expect(r.error?.message).toMatch(/is not standard/);
  });

  it("A certainly never sent (no connection) → B is tried once (the first attempt that can transmit)", async () => {
    const down = fakeOfficialRpc({ ...identified, submitTransaction: () => ({ transactionId: TXID }) }, { connectError: new Error("Unable to connect") });
    const b = node("ok");
    const r = await outcome(new LoadBalancedRpcProvider([client(down), client(b.rpc)]).submitTransaction(tx(TXID) as any));
    expect(r.result).toEqual({ transactionId: TXID });
    expect(b.received).toHaveLength(1);
  });

  it("the generic call() of a broadcast method is not failed over either", async () => {
    const a = node("hang");
    const b = node("ok");
    const r = await outcome(new LoadBalancedRpcProvider([client(a.rpc), client(b.rpc)]).call("submitTransaction", { transaction: tx(TXID) }));
    expect(b.received).toHaveLength(0);
    expect(r.error?.code).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
  });

  it("control: read-only calls still fail over", async () => {
    const down = fakeOfficialRpc({ getBlockDagInfo: () => { throw new Error("socket hang up"); } });
    const up = fakeOfficialRpc({ getBlockDagInfo: () => ({ network: "simnet", virtualDaaScore: 7 }) });
    const r = await outcome(new LoadBalancedRpcProvider([client(down, { retry: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1 } }), client(up)]).getBlockDagInfo());
    expect(r.error).toBeUndefined();
  });
});

describe("RPC-SUBMIT-SAFETY-1 · JsonWrpcKaspaClient (the SDK's default transport)", () => {
  it("an empty answer is not an accepted submission", async () => {
    const n = node("empty");
    const r = await outcome(new JsonWrpcKaspaClient({ rpcUrl: url, rpcFactory: n.rpc.factory }).submitTransaction(tx(TXID) as any));
    expect((r.result as any)?.accepted).not.toBe(true);
    expect(r.error?.code).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
    expect(n.received).toHaveLength(1);
  });

  it("an answer naming another transaction is not an accepted submission", async () => {
    const n = node("other-id");
    const r = await outcome(new JsonWrpcKaspaClient({ rpcUrl: url, rpcFactory: n.rpc.factory }).submitTransaction(tx(TXID) as any));
    expect(r.error?.code).toBe("RPC_SUBMIT_OUTCOME_UNKNOWN");
  });

  it("control: a normal answer is accepted with the node's id, one submission", async () => {
    const n = node("ok");
    const r = await new JsonWrpcKaspaClient({ rpcUrl: url, rpcFactory: n.rpc.factory }).submitTransaction(tx(TXID) as any);
    expect(r).toMatchObject({ transactionId: TXID, accepted: true });
    expect(n.received).toHaveLength(1);
  });
});
