import { describe, it, expect } from "vitest";
import { getCoinbaseMaturity } from "@hardkas/core";
import { selectV1FeeInputs, type V1FeeCoin } from "../src/index.js";

// -----------------------------------------------------------------------------
// F1.7 · the funder's P2PK coins that pay a v1 fee: never a covenant's UTXO, a coin being spent in the node's mempool or
// an immature coinbase; largest first, then by outpoint; the same coins give the same choice in any order;
// V1_FEE_INPUTS_INSUFFICIENT when the candidates do not reach the target. Coinbase maturity is the SDK's for simnet.
// -----------------------------------------------------------------------------

const SPK = "000020" + "dd".repeat(32) + "ac";
const coin = (n: number, amount: bigint, over: Partial<V1FeeCoin> = {}): V1FeeCoin => ({
  outpoint: { transactionId: n.toString(16).padStart(2, "0").repeat(32), index: 0 },
  amountSompi: amount,
  scriptPublicKey: SPK,
  blockDaaScore: 10n,
  isCoinbase: false,
  ...over
});
const key = (c: V1FeeCoin) => `${c.outpoint.transactionId}:${c.outpoint.index}`;

describe("F1.7 · selectV1FeeInputs", () => {
  const maturity = getCoinbaseMaturity("simnet");
  const daa = 50_000n;
  const covenant = coin(1, 900_000_000n, { covenantId: "ab".repeat(32) });
  const pending = coin(2, 800_000_000n);
  const immature = coin(3, 700_000_000n, { isCoinbase: true, blockDaaScore: daa - maturity + 1n });
  const matureCoinbase = coin(4, 300_000_000n, { isCoinbase: true, blockDaaScore: daa - maturity });
  const small = coin(5, 100_000_000n);
  const tieA = coin(6, 300_000_000n);
  const all = [covenant, pending, immature, matureCoinbase, small, tieA];
  const select = (coins: V1FeeCoin[], target: bigint) => selectV1FeeInputs({ networkId: "simnet", virtualDaaScore: daa, coins, pendingOutpoints: new Set([key(pending)]), targetSompi: target });

  it("FI-1 a covenant UTXO, a pending coin and an immature coinbase are never chosen, whatever their size; each is reported with its reason", () => {
    const r = select(all, 650_000_000n);
    expect(r.selected.map(key)).toEqual([key(matureCoinbase), key(tieA), key(small)]);
    expect(r.totalSompi).toBe(700_000_000n);
    expect(r.excluded).toEqual(
      [
        { outpoint: key(covenant), reason: "covenant" },
        { outpoint: key(pending), reason: "pending" },
        { outpoint: key(immature), reason: "immature" }
      ].sort((a, b) => (a.outpoint < b.outpoint ? -1 : 1))
    );
  });

  it("FI-2 deterministic: every order of the same coins gives the same coins in the same order (equal amounts by outpoint)", () => {
    const expected = select(all, 650_000_000n).selected.map(key);
    for (const order of [[...all].reverse(), [all[4]!, all[0]!, all[5]!, all[2]!, all[3]!, all[1]!], [all[3]!, all[5]!, all[1]!, all[4]!, all[0]!, all[2]!]]) {
      expect(select(order, 650_000_000n).selected.map(key)).toEqual(expected);
    }
  });

  it("FI-3 the largest coins first, only as many as needed", () => {
    expect(select(all, 250_000_000n).selected.map(key)).toEqual([key(matureCoinbase)]);
    expect(select(all, 300_000_001n).selected.map(key)).toEqual([key(matureCoinbase), key(tieA)]);
  });

  it("FI-4 not enough spendable coins: V1_FEE_INPUTS_INSUFFICIENT with what is available and what is needed", () => {
    expect(() => select(all, 700_000_001n)).toThrow(expect.objectContaining({ code: "V1_FEE_INPUTS_INSUFFICIENT", detail: expect.objectContaining({ availableSompi: "700000000", neededSompi: "700000001" }) }));
    expect(() => select([covenant, pending, immature], 1n)).toThrow(expect.objectContaining({ code: "V1_FEE_INPUTS_INSUFFICIENT" }));
  });
});
