import { describe, it, expect } from "vitest";
import { buildPaymentPlan, createMockUtxo } from "../src/index.js";
import { verifyTxPlanSemantics } from "../src/verify.js";

describe("Transaction Semantic Verification", () => {
  // Relayable amounts: storage mass (KIP-9) makes sub-KAS outputs costly or non-standard.
  const utxo = createMockUtxo({ address: "kaspa:address1", amountSompi: 100_000_000_000n });
  const request = {
    coinbaseMaturity: 100n,
    fromAddress: "kaspa:address1",
    availableUtxos: [utxo],
    outputs: [{ address: "kaspa:address2", amountSompi: 50_000_000_000n }],
    feeRateSompiPerMass: 1n
  };

  it("should pass for a valid plan", () => {
    const plan = buildPaymentPlan(request);

    const result = verifyTxPlanSemantics(plan);
    expect(result.issues).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it("should fail on mass mismatch", () => {
    const plan = buildPaymentPlan(request);

    // Corrupt mass
    (plan as any).estimatedMass = 50n;

    const result = verifyTxPlanSemantics(plan);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "MASS_MISMATCH")).toBe(true);
  });

  it("should detect duplicate inputs", () => {
    const plan = buildPaymentPlan(request);

    // Duplicate first input
    (plan as any).inputs = [...plan.inputs, plan.inputs[0]];

    const result = verifyTxPlanSemantics(plan);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "DUPLICATE_INPUT")).toBe(true);
  });

  it("should detect dust outputs as errors", () => {
    // The planner will not build this (its storage mass is not relayable), so it is handed in.
    const plan = {
      inputs: [utxo],
      outputs: [{ address: "kaspa:address2", amountSompi: 100n }], // Dust
      change: { address: "kaspa:address1", amountSompi: 100_000_000_000n - 100n - 1_000_000n },
      estimatedMass: 10_000n,
      estimatedFeeSompi: 1_000_000n
    };

    const result = verifyTxPlanSemantics(plan as any);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "DUST_OUTPUT")).toBe(true);
    expect(result.issues.some((i) => i.code === "MASS_ABOVE_STANDARD_LIMIT")).toBe(true);
  });

  it("should detect dust change as error", () => {
    // Manually construct a plan with dust change
    const plan = {
      inputs: [utxo],
      outputs: [{ address: "kaspa:address2", amountSompi: 100_000_000_000n - 100n - 1_000_000n }],
      change: { address: "kaspa:address1", amountSompi: 100n }, // Dust change
      estimatedMass: 10_000n,
      estimatedFeeSompi: 1_000_000n
    };

    const result = verifyTxPlanSemantics(plan as any);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "DUST_CHANGE")).toBe(true);
  });
});
