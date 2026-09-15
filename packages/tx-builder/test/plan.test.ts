import { describe, it, expect } from "vitest";
import { buildPaymentPlan, createMockUtxo, calculateUpstreamMass } from "../src/index";
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

    // Mass and minimum fee of this exact transaction (1 input, recipient + change), per the SDK.
    // A 1 KAS output carries ~10000 grams of storage mass (KIP-9), above the ~2036 compute mass.
    const upstream = calculateUpstreamMass({
      networkId: "simnet",
      inputs: [{ amountSompi: balanceSompi }],
      outputs: [
        { amountSompi, address: "kaspa:sim_bob" },
        { amountSompi: plan.change!.amountSompi, address: "kaspa:sim_alice" }
      ]
    });
    expect(plan.estimatedMass).toBe(upstream.mass);
    // C/1 KAS = 10^12/10^8 = 10000; the change and input terms (~10 each) cancel.
    expect(plan.estimatedMass).toBe(10_000n);
    // Rate 1 is below the node's minimum (100 sompi/gram): the minimum applies.
    expect(plan.estimatedFeeSompi).toBe(upstream.minimumFeeSompi);

    const expectedChange = balanceSompi - amountSompi - plan.estimatedFeeSompi;
    expect(plan.change?.amountSompi).toBe(expectedChange);
    expect(plan.change?.address).toBe("kaspa:sim_alice");
  });
});
