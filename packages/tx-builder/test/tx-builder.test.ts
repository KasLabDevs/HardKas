import { describe, expect, test } from "vitest";
import { buildPaymentPlan, createMockUtxo } from "../src/index";

describe("buildPaymentPlan", () => {
  test("selects UTXOs and creates change", () => {
    const plan = buildPaymentPlan({
      fromAddress: "kaspa:alice",
      outputs: [{ address: "kaspa:bob", amountSompi: 100_000_000n }],
      availableUtxos: [
        createMockUtxo({
          address: "kaspa:alice",
          amountSompi: 200_000_000n
        })
      ],
      feeRateSompiPerMass: 1n
    });

    expect(plan.inputs).toHaveLength(1);
    expect(plan.change?.amountSompi).toBeGreaterThan(0n);
  });
});
