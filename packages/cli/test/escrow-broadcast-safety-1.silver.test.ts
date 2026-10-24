import { describe, it, expect } from "vitest";
import { RpcSubmitOutcomeUnknownError, RpcTimeoutError, markRequestNotSent } from "@hardkas/kaspa-rpc";

// ESCROW-BROADCAST-SAFETY-1 · `hardkas silver deploy|spend|covenant` send their own transactions. Before, ANY submit
// failure was SILVER_REJECTED_BY_NODE — a timeout after the node received the transaction read as "rejected", an
// invitation to build and send another one. Now only the node's own refusal is a rejection.

const TX = "ab".repeat(32);
async function run(behaviour: () => Promise<unknown>) {
  const mod: any = await import("../src/commands/silver.js");
  expect(typeof mod.submitSilverTransaction).toBe("function");
  let submits = 0;
  const rpc = { submitTransaction: async () => { submits++; return behaviour(); } };
  try {
    const txId = await mod.submitSilverTransaction(rpc, { id: TX }, "deploy", TX);
    return { txId, code: undefined as string | undefined, message: "", submits };
  } catch (e: any) {
    return { txId: undefined, code: e?.code as string | undefined, message: String(e?.message), submits };
  }
}

describe("ESCROW-BROADCAST-SAFETY-1 · silver CLI submit outcome", () => {
  it("timeout after the send → SILVER_SUBMIT_OUTCOME_UNKNOWN naming the txId (never 'rejected'); one submit", async () => {
    const r = await run(async () => { throw new RpcSubmitOutcomeUnknownError({ txId: TX, cause: new RpcTimeoutError("timed out") }); });
    expect(r.code).toBe("SILVER_SUBMIT_OUTCOME_UNKNOWN");
    expect(r.message).toContain(TX);
    expect(r.submits).toBe(1);
  });

  it("'already in the mempool' → unknown, not rejected", async () => {
    const r = await run(async () => { throw new Error(`Rejected transaction ${TX}: transaction ${TX} is already in the mempool`); });
    expect(r.code).toBe("SILVER_SUBMIT_OUTCOME_UNKNOWN");
  });

  it("an empty answer, or another transaction's id → unknown, never a txId", async () => {
    expect((await run(async () => ({}))).code).toBe("SILVER_SUBMIT_OUTCOME_UNKNOWN");
    const other = await run(async () => ({ transactionId: "cd".repeat(32) }));
    expect(other.txId).toBeUndefined();
    expect(other.code).toBe("SILVER_SUBMIT_OUTCOME_UNKNOWN");
  });

  it("the node's own refusal → SILVER_REJECTED_BY_NODE; a refusal before the transport → SILVER_SUBMIT_NOT_SENT", async () => {
    expect((await run(async () => { throw new Error(`Rejected transaction ${TX}: transaction ${TX} is not standard: x`); })).code).toBe("SILVER_REJECTED_BY_NODE");
    expect((await run(async () => { throw markRequestNotSent(new Error("Unable to connect")); })).code).toBe("SILVER_SUBMIT_NOT_SENT");
  });

  it("control: an accepted submission returns the txId", async () => {
    expect((await run(async () => ({ transactionId: TX }))).txId).toBe(TX);
  });
});
