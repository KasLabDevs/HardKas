import { describe, expect, it } from "vitest";
import { buildPaymentPlan, calculateUpstreamMass } from "../src/index.js";

describe("P84: V1 Plan generation", () => {
  it("should calculate correct fee and include V1 fields when version is 1", () => {
    const address = "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhg0eec5";
    const mockUtxos: any[] = [
      {
        outpoint: { transactionId: "0".repeat(64), index: 0 },
        address,
        amountSompi: 100000000n,
        scriptPublicKey: "200000000000000000000000000000000000000000000000000000000000000000ac"
      }
    ];

    const plan = buildPaymentPlan({ coinbaseMaturity: 100n,
      fromAddress: address,
      availableUtxos: mockUtxos,
      outputs: [{ address, amountSompi: 50000000n }],
      feeRateSompiPerMass: 1n,
      networkId: "testnet-10",
      version: 1,
      lane: "LANE1"
    });

    expect(plan.version).toBe(1);
    expect(plan.lane).toBe("LANE1");

    // The fee is the SDK's minimum for this exact version-1 transaction (no HardKAS
    // compute formula): small outputs make storage mass the binding term.
    const upstream = calculateUpstreamMass({
      networkId: "testnet-10",
      version: 1,
      inputs: [{ amountSompi: 100000000n, scriptPublicKey: mockUtxos[0].scriptPublicKey }],
      outputs: [
        { amountSompi: 50000000n, address },
        ...(plan.change ? [{ amountSompi: plan.change.amountSompi, address }] : [])
      ]
    });
    expect(plan.estimatedMass).toBe(upstream.mass);
    expect(plan.estimatedFeeSompi).toBe(upstream.minimumFeeSompi);
  });
});
