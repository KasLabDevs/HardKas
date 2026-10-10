import { describe, it, expect } from "vitest";
import { calculateContentHash, CURRENT_HASH_VERSION, HARDKAS_VERSION } from "@hardkas/artifacts";
import { effectSummary, notAcceptedFailure, outcomeOfEffect, sendOutcomeLabel } from "../src/runners/next-steps.js";

// EVENT-LEDGER-2 · reviewer final closeout — how `tx send` reports what its send step did (the helpers are new in this
// closeout, so they have no BEFORE of their own; the behaviour they replace is pinned by event-ledger-2-flow.test.ts and
// the SDK tests):
//  - decision 2: AUX-11's `submitted` / `rejected`, plus `unknown` with TX_SUBMISSION_OUTCOME_UNKNOWN for a submit call
//    that failed without an answer — never reported as the node's rejection;
//  - A1: a ledger failure's outcome follows what the send step had done (an accepted request or an execution is
//    `submitted`, never `failed`/"not sent").

const TX = "c".repeat(64);
const submission = (submitResult: Record<string, unknown>) => {
  const a: any = {
    schema: "hardkas.txSubmission.v1",
    hardkasVersion: HARDKAS_VERSION,
    version: "1.0.0-alpha",
    hashVersion: CURRENT_HASH_VERSION,
    networkId: "simnet",
    mode: "localnet",
    createdAt: "2026-10-09T00:00:00.000Z",
    signedArtifactId: "a".repeat(64),
    txId: TX,
    submitResult,
    lineage: { artifactId: "", parentArtifactId: "a".repeat(64), lineageId: "9".repeat(64), rootArtifactId: "9".repeat(64), sequence: 3 }
  };
  a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
  a.lineage.artifactId = a.contentHash;
  return a;
};
const NODE_REJECTION = `Rejected transaction ${TX}: transaction ${TX} is an orphan where orphan is disallowed`;
const NO_ANSWER = "RPC request submitTransaction timed out after 5000ms";

describe("EVENT-LEDGER-2 final closeout · tx send reports what its send step did", () => {
  it("outcome: submitted / rejected / unknown — a submit call without an answer is never `rejected`", () => {
    expect(sendOutcomeLabel(submission({ accepted: true, transactionId: TX }), true)).toBe("submitted");
    expect(sendOutcomeLabel(submission({ accepted: false, error: NODE_REJECTION }), false)).toBe("rejected");
    expect(sendOutcomeLabel(submission({ accepted: false }), false)).toBe("rejected");
    expect(sendOutcomeLabel(submission({ accepted: false, error: NO_ANSWER }), false)).toBe("unknown");
    // a simulator receipt has no submit result: unchanged (AUX-11)
    expect(sendOutcomeLabel({ schema: "hardkas.txReceipt", status: "failed" }, false)).toBe("rejected");
  });

  it("the failure: TX_SUBMISSION_REJECTED for the node's rejection, TX_SUBMISSION_OUTCOME_UNKNOWN for a call without an answer", () => {
    const rejected = notAcceptedFailure(submission({ accepted: false, error: NODE_REJECTION }), TX);
    expect(rejected).toMatchObject({ code: "TX_SUBMISSION_REJECTED", title: "Transaction NOT accepted by the node" });
    expect(rejected.message).toContain("orphan");
    const unknown = notAcceptedFailure(submission({ accepted: false, error: NO_ANSWER }), TX);
    expect(unknown.code).toBe("TX_SUBMISSION_OUTCOME_UNKNOWN");
    expect(unknown.title).toMatch(/UNKNOWN: the node may have received the transaction/);
    expect(unknown.message).toContain(NO_ANSWER);
    expect(unknown.message).toContain(`hardkas tx status ${TX}`);
    expect(`${unknown.title} ${unknown.message}`).not.toMatch(/rejected|did not accept|NOT accepted/i);
  });

  it("a ledger failure's outcome follows the effect: accepted or executed → submitted; rejected; unknown; not performed → failed", () => {
    expect(outcomeOfEffect({ operation: "broadcast", outcome: "accepted" })).toBe("submitted");
    expect(outcomeOfEffect({ operation: "simulated-execution", outcome: "executed" })).toBe("submitted");
    expect(outcomeOfEffect({ operation: "broadcast", outcome: "rejected" })).toBe("rejected");
    expect(outcomeOfEffect({ operation: "broadcast", outcome: "unknown" })).toBe("unknown");
    expect(outcomeOfEffect({ operation: "broadcast", outcome: "not-performed" })).toBe("failed");
    expect(outcomeOfEffect(undefined)).toBe("failed");
    expect(effectSummary({ operation: "broadcast", outcome: "accepted", txId: TX })).toBe(
      `the node accepted the submission of transaction ${TX}: RPC acceptance of the request, not acceptance in the DAG`
    );
  });
});
