import { describe, it, expect } from "vitest";
import { buildPaymentPlan, createMockUtxo, estimateTransactionMass } from "../src/index.js";

const ALICE = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
const BOB = "kaspasim:qzgh3e6qqe6jfevf0dc652uszm0lnhvhzmasga5lka4kcl5udget5065p52eh";

/**
 * Toccata fees follow the pinned SDK. HardKAS used to charge its own
 * compute-budget formula (100 * max(txMass + budget * 100, 2 * bytes)), which
 * rusty-kaspa 2.0.1 does not implement; it is gone.
 */
describe("P83: Toccata Fee Model (upstream)", () => {
  it("does not charge computeBudget: the pinned SDK prices it at zero", () => {
    const utxos = [createMockUtxo({ address: ALICE, amountSompi: 500_000_000n })];
    const base = {
      coinbaseMaturity: 100n,
      fromAddress: ALICE,
      availableUtxos: utxos,
      feeRateSompiPerMass: 100n,
      outputs: [{ address: BOB, amountSompi: 100_000_000n }],
      version: 1 as const
    };
    const without = buildPaymentPlan(base);
    const withBudget = buildPaymentPlan({ ...base, computeBudget: 10_000n });
    expect(withBudget.estimatedFeeSompi).toBe(without.estimatedFeeSompi);
    expect(withBudget.computeBudget).toBe(10_000n);
  });

  it("version 1 inputs carry no sig-op mass (sigOpCount = 0)", () => {
    const v0 = estimateTransactionMass({ inputCount: 1, outputs: [{ address: BOB }], version: 0 });
    const v1 = estimateTransactionMass({ inputCount: 1, outputs: [{ address: BOB }], version: 1 });
    expect(v0.mass - v1.mass).toBe(1000n);
  });
});
