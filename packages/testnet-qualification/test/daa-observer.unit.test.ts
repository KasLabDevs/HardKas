import { describe, it, expect, vi } from "vitest";
import {
  waitForAcceptance,
  type DaaObserverRpc,
  type DaaObserverUtxoRow
} from "../src/daa-observer.js";

// TN10-CONFIRMATION-FIX-1: observeInclusion (a block hash read from a UTXO row — kaspad never serves one) and
// assertConfirmedByDaaDelta (a DAA delta counted as confirmations) were removed; the accepting chain block and its
// blue-score depth are covered by chain-acceptance.unit.test.ts.

const TXID = "aa".repeat(32);
const ADDR = "kaspatest:qsomerecipient";

interface ScriptedMempool {
  readonly at: readonly ({ txid: string } | null)[];
}
interface ScriptedUtxos {
  readonly at: readonly (readonly DaaObserverUtxoRow[])[];
}
function scriptedRpc(input: {
  mempool: ScriptedMempool;
  utxos: ScriptedUtxos;
}): DaaObserverRpc & { calls: { mempool: number; utxos: number } } {
  const state = { mempool: 0, utxos: 0 };
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
