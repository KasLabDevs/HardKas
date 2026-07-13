import { describe, it, expect } from "vitest";
import { buildPaymentPlan, createMockUtxo } from "../src/index";
import { SOMPI_PER_KAS } from "@hardkas/core";

describe("tx-builder plan", () => {
  it("should build a payment plan from Alice to Bob for 1 KAS with 1000 KAS balance", () => {
    const amountSompi = 1n * SOMPI_PER_KAS;
    const balanceSompi = 1000n * SOMPI_PER_KAS;
    const feeRate = 1n;

    const plan = buildPaymentPlan({ coinbaseMaturity: 100n,
      fromAddress: "kaspa:sim_alice",
      outputs: [
        {
          address: "kaspa:sim_bob",
          amountSompi
        }
      ],
      availableUtxos: [
        createMockUtxo({
          address: "kaspa:sim_alice",
          amountSompi: balanceSompi,
          index: 0
        })
      ],
      feeRateSompiPerMass: feeRate
    });

    expect(plan.inputs).toHaveLength(1);
    expect(plan.inputs[0]?.amountSompi).toBe(balanceSompi);
    expect(plan.outputs).toHaveLength(1);
    expect(plan.outputs[0]?.amountSompi).toBe(amountSompi);

    // Estimated mass for 1 input, 2 outputs (1 recipient + 1 change) is 1060
    // Base(100) + Input(1*160) + Output(2*400) = 1060
    expect(plan.estimatedMass).toBe(1060n);
    expect(plan.estimatedFeeSompi).toBe(1060n);

    // Change = 1000 - 1 - 0.00000350 = 998.99999650
    const expectedChange = balanceSompi - amountSompi - plan.estimatedFeeSompi;
    expect(plan.change?.amountSompi).toBe(expectedChange);
    expect(plan.change?.address).toBe("kaspa:sim_alice");
  });
});
