import { describe, expect, it } from "vitest";
import { buildPaymentPlan } from "../src/index.js";

describe("P84: V1 Plan generation", () => {
  it("should calculate correct fee and include V1 fields when version is 1", () => {
    const mockUtxos: any[] = [
      {
        outpoint: { transactionId: "0".repeat(64), index: 0 },
        address: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhg0eec5",
        amountSompi: 100000000n,
        scriptPublicKey: "200000000000000000000000000000000000000000000000000000000000000000ac"
      }
    ];

    const plan = buildPaymentPlan({ coinbaseMaturity: 100n,
      fromAddress: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhg0eec5",
      availableUtxos: mockUtxos,
      outputs: [
        {
          address: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhg0eec5",
          amountSompi: 50000000n
        }
      ],
      feeRateSompiPerMass: 1n,
      version: 1,
      lane: "LANE1"
    });

    expect(plan.version).toBe(1);
    expect(plan.lane).toBe("LANE1");
    // txMass is ~2036. computeBudget = 0. doubleBytes = 4072. maxVal = 4072.
    // fee = 100 * 4072 = 407200n
    expect(plan.estimatedFeeSompi).toBe(407200n);
  });
});
