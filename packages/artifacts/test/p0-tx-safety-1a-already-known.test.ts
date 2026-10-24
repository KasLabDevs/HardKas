import { describe, it, expect } from "vitest";
import { submitOutcomeOf } from "../src/tx-status.js";

// P0-TX-SAFETY-1A — the node saying it ALREADY HOLDS the transaction is not a rejection.
// The texts are rusty-kaspa v2.1.0's, as they reach a client: RpcError::RejectedTransaction wraps the mempool RuleError
// as "Rejected transaction {id}: {rule error}" (rpc/core/src/error.rs; mining/errors/src/mempool.rs). Reporting them
// as `rejected` told the caller the payment did not happen — an invitation to plan and sign it again.

const TX = "ab".repeat(32);
const rejectedAs = (rule: string) => ({ accepted: false, error: `Rejected transaction ${TX}: ${rule}` });

describe("P0-TX-SAFETY-1A · submitOutcomeOf: 'already held' answers are unknown, never rejected", () => {
  it("RejectDuplicate: 'transaction <id> is already in the mempool' → unknown", () => {
    expect(submitOutcomeOf(rejectedAs(`transaction ${TX} is already in the mempool`))).toBe("unknown");
  });

  it("RejectAlreadyAccepted: 'transaction <id> was already accepted by the consensus' → unknown", () => {
    expect(submitOutcomeOf(rejectedAs(`transaction ${TX} was already accepted by the consensus`))).toBe("unknown");
  });

  it("RejectDuplicateOrphan: 'orphan transaction <id> is already in the orphan pool' → unknown", () => {
    expect(submitOutcomeOf(rejectedAs(`orphan transaction ${TX} is already in the orphan pool`))).toBe("unknown");
  });

  it("real rejections stay rejected (double spend by ANOTHER tx, not standard, orphan disallowed, missing outpoint)", () => {
    const other = "cd".repeat(32);
    expect(submitOutcomeOf(rejectedAs(`output ${other}:0 already spent by transaction ${other} in the mempool`))).toBe("rejected");
    expect(submitOutcomeOf(rejectedAs(`transaction ${TX} is not standard: x`))).toBe("rejected");
    expect(submitOutcomeOf(rejectedAs(`transaction ${TX} is an orphan where orphan is disallowed`))).toBe("rejected");
    expect(submitOutcomeOf(rejectedAs("at least one outpoint of the transaction is lacking a matching UTXO entry"))).toBe("rejected");
  });

  it("accepted and no-answer outcomes are unchanged", () => {
    expect(submitOutcomeOf({ accepted: true })).toBe("accepted");
    expect(submitOutcomeOf({ accepted: false, error: "RPC request submitTransaction timed out after 5000ms" })).toBe("unknown");
    expect(submitOutcomeOf({ accepted: false })).toBe("rejected");
    expect(submitOutcomeOf(undefined)).toBe("unknown");
  });
});
