import { describe, it, expect, vi } from "vitest";
import {
  submitWithAmbiguityGuard,
  type SubmissionGuardRpc
} from "../src/submission-guard.js";
import type { DaaObserverUtxoRow } from "../src/daa-observer.js";

const TXID = "cc".repeat(32);
const RECIPIENT = "kaspatest:qrrecipient";
const CHANGE = "kaspatest:qrfundingchange";

const FIXED_NOW = () => new Date("2026-09-15T14:00:00.000Z");
const noSleep = vi.fn(async (_ms: number) => {});

/**
 * Monotonically-advancing clock for tests with deadlines. Each call returns
 * a Date `stepMs` after the previous one, so `now().getTime() >= deadline`
 * eventually holds even without real time passing.
 */
function advancingClock(startIso: string, stepMs: number): () => Date {
  const start = new Date(startIso).getTime();
  let n = 0;
  return () => new Date(start + n++ * stepMs);
}

interface Scripted {
  submitImpl: () => Promise<{ transactionId?: string }>;
  mempoolAt: readonly ({ txid: string } | null)[];
  utxosAt: readonly (readonly DaaObserverUtxoRow[])[];
}

function scriptedRpc(input: Scripted): SubmissionGuardRpc & { calls: { submit: number; mempool: number; utxos: number } } {
  const calls = { submit: 0, mempool: 0, utxos: 0 };
  const rpc: any = {
    calls,
    async submitTransaction(signedTx: unknown) {
      calls.submit++;
      return input.submitImpl();
    },
    async getMempoolEntry(_txid: string) {
      const idx = Math.min(calls.mempool, input.mempoolAt.length - 1);
      calls.mempool++;
      return input.mempoolAt[idx] ?? null;
    },
    async getUtxosByAddress(_addr: string) {
      const idx = Math.min(calls.utxos, input.utxosAt.length - 1);
      calls.utxos++;
      return input.utxosAt[idx] ?? [];
    }
  };
  return rpc;
}

function utxoWith(txid: string): DaaObserverUtxoRow {
  return { outpoint: { transactionId: txid, index: 0 }, amountSompi: 1n };
}

const baseInput = {
  signedTx: {},
  txid: TXID,
  watchAddresses: [RECIPIENT, CHANGE]
};

describe("submitWithAmbiguityGuard — happy path", () => {
  it("returns SUBMITTED on first-attempt success", async () => {
    const rpc = scriptedRpc({
      submitImpl: async () => ({ transactionId: TXID }),
      mempoolAt: [null],
      utxosAt: [[]]
    });
    const outcome = await submitWithAmbiguityGuard(
      { rpc, ...baseInput },
      { now: FIXED_NOW, sleep: noSleep }
    );
    expect(outcome.state).toBe("SUBMITTED");
    expect(outcome.resolvedVia).toBe("first-attempt");
    expect(outcome.attempts).toBe(1);
    expect(outcome.txid).toBe(TXID);
    expect(rpc.calls.submit).toBe(1);
    // No probing needed on happy path.
    expect(rpc.calls.mempool).toBe(0);
    expect(rpc.calls.utxos).toBe(0);
  });
});

describe("submitWithAmbiguityGuard — ambiguous submit, positive observation", () => {
  it("transport failure + subsequent mempool hit → OBSERVED_MEMPOOL, no resubmit (adversarial #2)", async () => {
    const rpc = scriptedRpc({
      submitImpl: async () => { throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }); },
      mempoolAt: [{ txid: TXID }],
      utxosAt: [[]]
    });
    const outcome = await submitWithAmbiguityGuard(
      { rpc, ...baseInput },
      { now: FIXED_NOW, sleep: noSleep, probeWaitBeforeMs: 0, probeMaxWaitMs: 1000, probePollIntervalMs: 1 }
    );
    expect(outcome.state).toBe("OBSERVED_MEMPOOL");
    expect(outcome.resolvedVia).toBe("post-ambiguity-mempool-hit");
    expect(outcome.txid).toBe(TXID);
    // The critical invariant: exactly ONE submit call, ever.
    expect(rpc.calls.submit).toBe(1);
  });

  it("transport failure + subsequent UTXO hit on witness address → OBSERVED_ACCEPTED, no resubmit", async () => {
    const rpc = scriptedRpc({
      submitImpl: async () => { throw Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }); },
      mempoolAt: [null],
      utxosAt: [
        [], // first call (RECIPIENT) empty
        [utxoWith(TXID)] // second call (CHANGE) hit
      ]
    });
    const outcome = await submitWithAmbiguityGuard(
      { rpc, ...baseInput },
      { now: FIXED_NOW, sleep: noSleep, probeWaitBeforeMs: 0, probeMaxWaitMs: 1000, probePollIntervalMs: 1 }
    );
    expect(outcome.state).toBe("OBSERVED_ACCEPTED");
    expect(outcome.resolvedVia).toBe("post-ambiguity-utxo-hit");
    expect(outcome.witnessAddress).toBe(CHANGE);
    expect(rpc.calls.submit).toBe(1);
  });

  it("'already known' server response + mempool hit → OBSERVED_MEMPOOL with already-known-mempool-hit", async () => {
    const rpc = scriptedRpc({
      submitImpl: async () => { throw new Error("Transaction already in mempool"); },
      mempoolAt: [{ txid: TXID }],
      utxosAt: [[]]
    });
    const outcome = await submitWithAmbiguityGuard(
      { rpc, ...baseInput },
      { now: FIXED_NOW, sleep: noSleep, probeWaitBeforeMs: 0, probeMaxWaitMs: 1000, probePollIntervalMs: 1 }
    );
    expect(outcome.state).toBe("OBSERVED_MEMPOOL");
    expect(outcome.resolvedVia).toBe("already-known-mempool-hit");
    expect(rpc.calls.submit).toBe(1);
  });
});

describe("submitWithAmbiguityGuard — never blind resubmit", () => {
  it("transport failure + no positive observation → UNRESOLVED, zero resubmissions (adversarial #1)", async () => {
    const rpc = scriptedRpc({
      submitImpl: async () => { throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }); },
      mempoolAt: [null, null, null, null],
      utxosAt: [[], [], [], []]
    });
    const outcome = await submitWithAmbiguityGuard(
      { rpc, ...baseInput },
      { now: advancingClock("2026-09-15T14:00:00.000Z", 3), sleep: noSleep, probeWaitBeforeMs: 0, probeMaxWaitMs: 5, probePollIntervalMs: 1 }
    );
    expect(outcome.state).toBe("UNRESOLVED");
    expect(outcome.resolvedVia).toBe("transport-ambiguity-no-positive-observation");
    // Critical: exactly ONE submit call.
    expect(rpc.calls.submit).toBe(1);
    // We may have probed several rounds, but there was no second submit.
    expect(rpc.calls.mempool).toBeGreaterThanOrEqual(1);
  });

  it("'already known' but observation empty within budget → UNRESOLVED (never resubmit)", async () => {
    const rpc = scriptedRpc({
      submitImpl: async () => { throw new Error("Duplicate transaction, already known"); },
      mempoolAt: [null, null, null],
      utxosAt: [[], [], []]
    });
    const outcome = await submitWithAmbiguityGuard(
      { rpc, ...baseInput },
      { now: advancingClock("2026-09-15T14:00:00.000Z", 3), sleep: noSleep, probeWaitBeforeMs: 0, probeMaxWaitMs: 5, probePollIntervalMs: 1 }
    );
    expect(outcome.state).toBe("UNRESOLVED");
    expect(outcome.resolvedVia).toBe("already-known-but-not-observed");
    expect(rpc.calls.submit).toBe(1);
  });
});

describe("submitWithAmbiguityGuard — pre-mempool rejection", () => {
  it("clear consensus rejection (invalid signature) → SAFE_TO_RETRY", async () => {
    const rpc = scriptedRpc({
      submitImpl: async () => { throw new Error("Transaction rejected: invalid signature"); },
      mempoolAt: [null],
      utxosAt: [[]]
    });
    const outcome = await submitWithAmbiguityGuard(
      { rpc, ...baseInput },
      { now: FIXED_NOW, sleep: noSleep }
    );
    expect(outcome.state).toBe("SAFE_TO_RETRY");
    expect(outcome.resolvedVia).toBe("consensus-pre-mempool-rejection");
    // SAFE_TO_RETRY should NOT have probed — the server told us it never accepted.
    expect(rpc.calls.mempool).toBe(0);
    expect(rpc.calls.utxos).toBe(0);
    expect(rpc.calls.submit).toBe(1);
  });

  it("mass-exceeds-maximum → SAFE_TO_RETRY (caller must resize)", async () => {
    const rpc = scriptedRpc({
      submitImpl: async () => { throw new Error("mass exceeds maximum standard mass"); },
      mempoolAt: [null],
      utxosAt: [[]]
    });
    const outcome = await submitWithAmbiguityGuard(
      { rpc, ...baseInput },
      { now: FIXED_NOW, sleep: noSleep }
    );
    expect(outcome.state).toBe("SAFE_TO_RETRY");
    expect(rpc.calls.submit).toBe(1);
  });
});

describe("submitWithAmbiguityGuard — re-throw on other classes", () => {
  it("network-mismatch is not the guard's concern; re-thrown to runner", async () => {
    const rpc = scriptedRpc({
      submitImpl: async () => { throw new Error("network mismatch on endpoint"); },
      mempoolAt: [null],
      utxosAt: [[]]
    });
    await expect(
      submitWithAmbiguityGuard({ rpc, ...baseInput }, { now: FIXED_NOW, sleep: noSleep })
    ).rejects.toThrow(/network mismatch/);
    expect(rpc.calls.submit).toBe(1);
  });

  it("unsynced is not the guard's concern; re-thrown to runner", async () => {
    const rpc = scriptedRpc({
      submitImpl: async () => { throw new Error("Node is still syncing"); },
      mempoolAt: [null],
      utxosAt: [[]]
    });
    await expect(
      submitWithAmbiguityGuard({ rpc, ...baseInput }, { now: FIXED_NOW, sleep: noSleep })
    ).rejects.toThrow(/still syncing/);
    expect(rpc.calls.submit).toBe(1);
  });

  it("unknown class is re-thrown (never blind-classified as SAFE_TO_RETRY)", async () => {
    const rpc = scriptedRpc({
      submitImpl: async () => { throw new Error("something opaque"); },
      mempoolAt: [null],
      utxosAt: [[]]
    });
    await expect(
      submitWithAmbiguityGuard({ rpc, ...baseInput }, { now: FIXED_NOW, sleep: noSleep })
    ).rejects.toThrow(/opaque/);
    expect(rpc.calls.submit).toBe(1);
  });
});

describe("submitWithAmbiguityGuard — no confirmation-mixing", () => {
  it("does NOT consult virtualDaaScore/DAA delta while resolving (that belongs to daa-observer)", async () => {
    const rpc = scriptedRpc({
      submitImpl: async () => { throw Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }); },
      mempoolAt: [{ txid: TXID }],
      utxosAt: [[]]
    });
    // If the guard reached for getBlockDagInfo it would throw a TypeError
    // (not defined on this rpc). The absence of a throw is the proof.
    const outcome = await submitWithAmbiguityGuard(
      { rpc, ...baseInput },
      { now: FIXED_NOW, sleep: noSleep, probeWaitBeforeMs: 0, probeMaxWaitMs: 100, probePollIntervalMs: 1 }
    );
    expect(outcome.state).toBe("OBSERVED_MEMPOOL");
  });
});
