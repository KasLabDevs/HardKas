import { describe, it, expect } from "vitest";
import { buildPaymentPlan, createMockUtxo } from "../src/index.js";
import { verifyTxPlanSemantics } from "../src/verify.js";

describe("Transaction Semantic Verification", () => {
  const utxo = createMockUtxo({ address: "kaspa:address1", amountSompi: 1000000n });
  
  it("should pass for a valid plan", () => {
    const plan = buildPaymentPlan({
      fromAddress: "kaspa:address1",
      availableUtxos: [utxo],
      outputs: [{ address: "kaspa:address2", amountSompi: 500000n }],
      feeRateSompiPerMass: 1n
    });

    const result = verifyTxPlanSemantics(plan);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("should fail on mass mismatch", () => {
    const plan = buildPaymentPlan({
      fromAddress: "kaspa:address1",
      availableUtxos: [utxo],
      outputs: [{ address: "kaspa:address2", amountSompi: 500000n }],
      feeRateSompiPerMass: 1n
    });

    // Corrupt mass
    (plan as any).estimatedMass = 50n;

    const result = verifyTxPlanSemantics(plan);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "MASS_MISMATCH")).toBe(true);
  });

  it("should detect duplicate inputs", () => {
    const plan = buildPaymentPlan({
      fromAddress: "kaspa:address1",
      availableUtxos: [utxo],
      outputs: [{ address: "kaspa:address2", amountSompi: 500000n }],
      feeRateSompiPerMass: 1n
    });

    // Duplicate first input
    (plan as any).inputs = [...plan.inputs, plan.inputs[0]];

    const result = verifyTxPlanSemantics(plan);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "DUPLICATE_INPUT")).toBe(true);
  });

  it("should detect dust outputs", () => {
    const plan = buildPaymentPlan({
      fromAddress: "kaspa:address1",
      availableUtxos: [utxo],
      outputs: [{ address: "kaspa:address2", amountSompi: 100n }], // Dust
      feeRateSompiPerMass: 1n
    });

    const result = verifyTxPlanSemantics(plan);
    expect(result.issues.some(i => i.code === "DUST_OUTPUT")).toBe(true);
  });
});
