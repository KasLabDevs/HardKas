import { describe, it, expect } from "vitest";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../src/canonical.js";
import { HARDKAS_VERSION } from "../src/constants.js";
import { deriveTxStatus } from "../src/tx-status.js";

// EVENT-LEDGER-2 · reviewer final closeout, decision 2: a submit call that failed WITHOUT an answer from the node (a
// timeout, a lost connection, a connection that never opened) is not the node's rejection — whether the node received
// the transaction is unknown. The derived state says so with an existing state (INSUFFICIENT_EVIDENCE: nothing decides
// yet; observe it), never REJECTED_BY_NODE; no consensus state is invented. The node's own rejection (its wire format,
// "Rejected transaction <txId>: <reason>", as the real-node fixtures record it) and an answer with accepted:false stay
// REJECTED_BY_NODE; an accepted submission stays SUBMITTED (the request was accepted at that instant, not DAG acceptance).

const TX = "a".repeat(64);
const SIGNED = "b".repeat(64);

function submission(submitResult: Record<string, unknown>): any {
  const s: any = {
    schema: "hardkas.txSubmission.v1",
    hardkasVersion: HARDKAS_VERSION,
    version: "1.0.0-alpha",
    hashVersion: CURRENT_HASH_VERSION,
    networkId: "simnet",
    mode: "localnet",
    createdAt: "2026-10-09T00:00:00.000Z",
    signedArtifactId: SIGNED,
    txId: TX,
    submitResult,
    workflowId: "wf_0000000000000000",
    lineage: { artifactId: "", parentArtifactId: SIGNED, lineageId: SIGNED, rootArtifactId: SIGNED, sequence: 3 }
  };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  return s;
}

const derive = (submitResult: Record<string, unknown>) => deriveTxStatus({ txId: TX, submission: submission(submitResult), observations: [] });

describe("EVENT-LEDGER-2 final closeout · a submit result decides only what it establishes", () => {
  it("a submit call that failed without an answer decides nothing: INSUFFICIENT_EVIDENCE, never REJECTED_BY_NODE", () => {
    for (const error of [
      "RPC request submitTransaction timed out after 5000ms",
      "Connection to Kaspa RPC at ws://127.0.0.1:16110 was lost: socket closed",
      "Cannot connect to Kaspa RPC at ws://127.0.0.1:16110. Connection timed out."
    ]) {
      const d = derive({ accepted: false, error });
      expect({ error, status: d.status }).toEqual({ error, status: "INSUFFICIENT_EVIDENCE" });
      expect(d.reasons.join(" ")).toMatch(/unknown/);
      expect(d.evidence.submissionArtifactId, "the attempt is still the evidence it names").toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("the node's own rejection in its wire format, and an answer with accepted:false, stay REJECTED_BY_NODE (control)", () => {
    expect(derive({ accepted: false, error: `Rejected transaction ${TX}: transaction ${TX} is an orphan where orphan is disallowed` }).status).toBe("REJECTED_BY_NODE");
    expect(derive({ accepted: false }).status).toBe("REJECTED_BY_NODE");
  });

  it("an accepted submission stays SUBMITTED: accepted at that instant on the responding node, nothing observed (control)", () => {
    const d = derive({ accepted: true, transactionId: TX });
    expect(d.status).toBe("SUBMITTED");
    expect(d.isFinal).toBe(false);
  });
});
