import { describe, it, expect, vi } from "vitest";
import {
  waitForAcceptance,
  observeInclusion,
  assertConfirmedByDaaDelta,
  type DaaObserverRpc,
  type DaaObserverUtxoRow,
  type InclusionEvidence
} from "../src/daa-observer.js";

const TXID = "aa".repeat(32);
const ADDR = "kaspatest:qsomerecipient";

interface ScriptedMempool {
  readonly at: readonly ({ txid: string } | null)[];
}
interface ScriptedUtxos {
  readonly at: readonly (readonly DaaObserverUtxoRow[])[];
}
interface ScriptedDag {
  readonly virtual: readonly (bigint | string | number)[];
}

function scriptedRpc(input: {
  mempool: ScriptedMempool;
  utxos: ScriptedUtxos;
  dag?: ScriptedDag;
}): DaaObserverRpc & { calls: { mempool: number; utxos: number; dag: number } } {
  const state = { mempool: 0, utxos: 0, dag: 0 };
  const rpc = {
    calls: state,
    async getMempoolEntry() {
      const idx = state.mempool < input.mempool.at.length - 1 ? state.mempool : input.mempool.at.length - 1;
      state.mempool++;
      return input.mempool.at[idx] ?? null;
    },
    async getUtxosByAddress() {
      const idx = state.utxos < input.utxos.at.length - 1 ? state.utxos : input.utxos.at.length - 1;
      state.utxos++;
      return input.utxos.at[idx] ?? [];
    },
    async getBlockDagInfo() {
      const idx = state.dag < (input.dag?.virtual.length ?? 0) - 1 ? state.dag : (input.dag?.virtual.length ?? 1) - 1;
      state.dag++;
      return { virtualDaaScore: input.dag?.virtual[idx] ?? 0n };
    }
  };
  return rpc as any;
}

const clockAt = (isoStart: string, tickMs: number) => {
  let n = 0;
  return () => new Date(new Date(isoStart).getTime() + n++ * tickMs);
};

describe("waitForAcceptance", () => {
  it("detects mempool-gone+utxo-present after having seen the tx in mempool", async () => {
    const rpc = scriptedRpc({
      mempool: { at: [{ txid: TXID }, null, null] },
      utxos: {
        at: [
          [],
          [],
          [{ outpoint: { transactionId: TXID, index: 0 }, amountSompi: 1_000_000_000n }]
        ]
      }
    });
    const sleep = vi.fn(async (_ms: number) => {});
    const evidence = await waitForAcceptance(
      rpc,
      { txid: TXID, watchAddresses: [ADDR] },
      { pollIntervalMs: 1, maxWaitMs: 10_000, sleep, now: clockAt("2026-09-15T12:00:00.000Z", 1) }
    );
    expect(evidence).toMatchObject({
      txid: TXID,
      detectedVia: "mempool-gone+utxo-present",
      witnessAddress: ADDR
    });
    expect(sleep).toHaveBeenCalled();
  });

  it("detects utxo-present-first-observation when the tx was never observed in mempool", async () => {
    const rpc = scriptedRpc({
      mempool: { at: [null] },
      utxos: {
        at: [[{ outpoint: { transactionId: TXID, index: 0 }, amountSompi: 1n }]]
      }
    });
    const sleep = vi.fn(async (_ms: number) => {});
    const evidence = await waitForAcceptance(
      rpc,
      { txid: TXID, watchAddresses: [ADDR] },
      { pollIntervalMs: 1, maxWaitMs: 10_000, sleep, now: clockAt("2026-09-15T12:00:00.000Z", 1) }
    );
    expect(evidence.detectedVia).toBe("utxo-present-first-observation");
  });

  it("does NOT treat 'gone from mempool alone' as acceptance", async () => {
    const rpc = scriptedRpc({
      mempool: { at: [{ txid: TXID }, null, null, null] },
      utxos: { at: [[], [], [], []] }
    });
    const sleep = vi.fn(async (_ms: number) => {});
    // Give a deadline shorter than what we'd need to accept. Should timeout.
    await expect(
      waitForAcceptance(
        rpc,
        { txid: TXID, watchAddresses: [ADDR] },
        { pollIntervalMs: 1, maxWaitMs: 5, sleep, now: clockAt("2026-09-15T12:00:00.000Z", 3) }
      )
    ).rejects.toThrow(/TQ_ACCEPTANCE_TIMEOUT/);
  });
});

describe("observeInclusion", () => {
  it("returns InclusionEvidence when the UTXO row carries blockDaaScore and blockHash", async () => {
    const rpc = scriptedRpc({
      mempool: { at: [null] },
      utxos: {
        at: [
          [{
            outpoint: { transactionId: TXID, index: 0 },
            amountSompi: 1n,
            blockDaaScore: 100n,
            blockHash: "cc".repeat(32)
          }]
        ]
      }
    });
    const evidence = await observeInclusion(rpc, { txid: TXID, witnessAddress: ADDR }, { now: clockAt("2026-09-15T12:00:00.000Z", 0) });
    expect(evidence).toMatchObject({
      txid: TXID,
      inclusionBlockHash: "cc".repeat(32),
      inclusionDaaScore: 100n
    });
    expect(evidence.observedAt).toBe("2026-09-15T12:00:00.000Z");
  });

  it("throws TQ_INCLUSION_UTXO_NOT_FOUND when the UTXO is absent", async () => {
    const rpc = scriptedRpc({ mempool: { at: [null] }, utxos: { at: [[]] } });
    await expect(
      observeInclusion(rpc, { txid: TXID, witnessAddress: ADDR })
    ).rejects.toThrow(/TQ_INCLUSION_UTXO_NOT_FOUND/);
  });

  it("throws TQ_INCLUSION_METADATA_MISSING when blockHash or blockDaaScore are missing", async () => {
    const rpcNoBlock = scriptedRpc({
      mempool: { at: [null] },
      utxos: {
        at: [
          [{ outpoint: { transactionId: TXID, index: 0 }, amountSompi: 1n, blockDaaScore: 100n }]
        ]
      }
    });
    await expect(
      observeInclusion(rpcNoBlock, { txid: TXID, witnessAddress: ADDR })
    ).rejects.toThrow(/TQ_INCLUSION_METADATA_MISSING/);

    const rpcNoScore = scriptedRpc({
      mempool: { at: [null] },
      utxos: {
        at: [
          [{ outpoint: { transactionId: TXID, index: 0 }, amountSompi: 1n, blockHash: "cc".repeat(32) }]
        ]
      }
    });
    await expect(
      observeInclusion(rpcNoScore, { txid: TXID, witnessAddress: ADDR })
    ).rejects.toThrow(/TQ_INCLUSION_METADATA_MISSING/);
  });
});

describe("assertConfirmedByDaaDelta", () => {
  const inclusion: InclusionEvidence = {
    txid: TXID,
    inclusionBlockHash: "cc".repeat(32),
    inclusionDaaScore: 100n,
    observedAt: "2026-09-15T12:00:00.000Z"
  };

  it("returns immediately when virtualDaaScore already meets the threshold", async () => {
    const rpc = scriptedRpc({
      mempool: { at: [null] },
      utxos: { at: [[]] },
      dag: { virtual: [150n] } // delta=50 >= 10
    });
    const sleep = vi.fn(async (_ms: number) => {});
    const conf = await assertConfirmedByDaaDelta(rpc, inclusion, {
      configuredDaaDelta: 10n,
      pollIntervalMs: 1,
      maxWaitMs: 1_000,
      sleep,
      now: clockAt("2026-09-15T12:00:00.000Z", 0)
    });
    expect(conf.deltaDaa).toBe(50n);
    expect(conf.configuredDaaDelta).toBe(10n);
    expect(conf.criterion).toBe("virtualDaaScore - inclusionDaaScore >= configuredDaaDelta");
    expect(sleep).toHaveBeenCalledTimes(0);
  });

  it("polls until threshold met", async () => {
    const rpc = scriptedRpc({
      mempool: { at: [null] },
      utxos: { at: [[]] },
      dag: { virtual: [101n, 105n, 110n, 115n] } // delta reaches 10 on the 4th read (115-100=15>=10 on 4th; 110-100=10>=10 on 3rd)
    });
    const sleep = vi.fn(async (_ms: number) => {});
    const conf = await assertConfirmedByDaaDelta(rpc, inclusion, {
      configuredDaaDelta: 10n,
      pollIntervalMs: 1,
      maxWaitMs: 1_000,
      sleep,
      now: clockAt("2026-09-15T12:00:00.000Z", 1)
    });
    expect(conf.deltaDaa).toBeGreaterThanOrEqual(10n);
    expect(sleep).toHaveBeenCalled();
  });

  it("throws TQ_CONFIRMATION_TIMEOUT when threshold is never met before deadline", async () => {
    const rpc = scriptedRpc({
      mempool: { at: [null] },
      utxos: { at: [[]] },
      dag: { virtual: [101n, 102n, 103n, 104n] }
    });
    const sleep = vi.fn(async (_ms: number) => {});
    await expect(
      assertConfirmedByDaaDelta(rpc, inclusion, {
        configuredDaaDelta: 100n,
        pollIntervalMs: 1,
        maxWaitMs: 5,
        sleep,
        now: clockAt("2026-09-15T12:00:00.000Z", 3)
      })
    ).rejects.toThrow(/TQ_CONFIRMATION_TIMEOUT/);
  });

  it("throws TQ_VIRTUAL_DAA_INVALID when the RPC returns an unusable virtualDaaScore", async () => {
    const rpc: DaaObserverRpc = {
      async getMempoolEntry() { return null; },
      async getUtxosByAddress() { return []; },
      async getBlockDagInfo() { return { virtualDaaScore: "not-a-number" as any }; }
    };
    await expect(
      assertConfirmedByDaaDelta(rpc, inclusion, {
        configuredDaaDelta: 10n,
        sleep: async () => {},
        now: clockAt("2026-09-15T12:00:00.000Z", 0)
      })
    ).rejects.toThrow(/TQ_VIRTUAL_DAA_INVALID/);
  });
});
