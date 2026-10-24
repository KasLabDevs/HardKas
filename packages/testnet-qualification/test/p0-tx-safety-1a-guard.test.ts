import { describe, it, expect, vi } from "vitest";
import { submitWithAmbiguityGuard, attemptOutcomeOf, type SubmissionGuardRpc } from "../src/submission-guard.js";

// P0-TX-SAFETY-1A — the TQ guard never answers SAFE_TO_RETRY when the node says it already holds the transaction.
// Texts: rusty-kaspa v2.1.0 (RpcError::RejectedTransaction around the mempool RuleError). Before the fix the patterns
// missed "is already in the mempool" / "is already in the orphan pool", the error fell to the consensus class
// ("rejected", "orphan") and the guard answered SAFE_TO_RETRY — "the tx never entered", for a tx the node holds.

const TX = "cc".repeat(32);
const noSleep = vi.fn(async (_ms: number) => {});
function clock(stepMs: number) {
  let n = 0;
  const start = Date.parse("2026-10-18T12:00:00.000Z");
  return () => new Date(start + n++ * stepMs);
}

function rpcThatAnswers(error: string, mempoolHit: boolean) {
  const calls = { submit: 0, mempool: 0 };
  const rpc: SubmissionGuardRpc = {
    async submitTransaction() {
      calls.submit++;
      throw new Error(error);
    },
    async getMempoolEntry() {
      calls.mempool++;
      return mempoolHit ? ({ txid: TX } as any) : null;
    },
    async getUtxosByAddress() {
      return [];
    }
  } as any;
  return { rpc, calls };
}

const opts = { sleep: noSleep, probeWaitBeforeMs: 0, probeMaxWaitMs: 5, probePollIntervalMs: 1 };

describe("P0-TX-SAFETY-1A · TQ guard: 'already held' is never SAFE_TO_RETRY", () => {
  for (const rule of [
    `transaction ${TX} is already in the mempool`,
    `transaction ${TX} was already accepted by the consensus`,
    `orphan transaction ${TX} is already in the orphan pool`
  ]) {
    it(`"${rule.replace(TX, "<id>")}" + mempool hit → OBSERVED_MEMPOOL; one submit`, async () => {
      const { rpc, calls } = rpcThatAnswers(`Rejected transaction ${TX}: ${rule}`, true);
      const out = await submitWithAmbiguityGuard({ rpc, signedTx: {}, txid: TX, watchAddresses: [] }, { ...opts, now: clock(1) });
      expect(out.state).toBe("OBSERVED_MEMPOOL");
      expect(out.resolvedVia).toBe("already-known-mempool-hit");
      expect(attemptOutcomeOf(out.state)).toBe("outcome_unknown");
      expect(calls.submit).toBe(1);
    });

    it(`"${rule.replace(TX, "<id>")}" + nothing observed → UNRESOLVED (never retry)`, async () => {
      const { rpc, calls } = rpcThatAnswers(`Rejected transaction ${TX}: ${rule}`, false);
      const out = await submitWithAmbiguityGuard({ rpc, signedTx: {}, txid: TX, watchAddresses: [] }, { ...opts, now: clock(10) });
      expect(out.state).toBe("UNRESOLVED");
      expect(out.resolvedVia).toBe("already-known-but-not-observed");
      expect(calls.submit).toBe(1);
    });
  }

  it("a real rejection (not standard) stays SAFE_TO_RETRY", async () => {
    const { rpc } = rpcThatAnswers(`Rejected transaction ${TX}: transaction ${TX} is not standard: x`, false);
    const out = await submitWithAmbiguityGuard({ rpc, signedTx: {}, txid: TX, watchAddresses: [] }, { ...opts, now: clock(1) });
    expect(out.state).toBe("SAFE_TO_RETRY");
  });
});
