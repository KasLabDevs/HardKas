import { describe, it, expect } from "vitest";
import { 
  estimateTransactionMass, 
  KASPA_MASS_CONSTANTS,
  buildPaymentPlan,
  createMockUtxo
} from "../src/index.js";

describe("Mass Estimation", () => {
  it("should calculate mass for a single input/single output P2PK transaction", () => {
    const result = estimateTransactionMass({
      inputCount: 1,
      outputs: [{ address: "kaspa:qpvkp8f..." }],
      hasChange: false
    });

    const expected = KASPA_MASS_CONSTANTS.BASE_TRANSACTION + 
                     KASPA_MASS_CONSTANTS.INPUT_P2PK + 
                     KASPA_MASS_CONSTANTS.OUTPUT_P2PK;
    
    expect(result.mass).toBe(expected);
  });

  it("should calculate mass with change output", () => {
    const result = estimateTransactionMass({
      inputCount: 1,
      outputs: [{ address: "kaspa:qpvkp8f..." }],
      hasChange: true
    });

    const expected = KASPA_MASS_CONSTANTS.BASE_TRANSACTION + 
                     KASPA_MASS_CONSTANTS.INPUT_P2PK + 
                     (KASPA_MASS_CONSTANTS.OUTPUT_P2PK * 2n);
    
    expect(result.mass).toBe(expected);
  });

  it("should identify non-P2PK addresses as scripts and use fallback mass", () => {
    const result = estimateTransactionMass({
      inputCount: 1,
      outputs: [{ address: "kaspa:ppvkp8f..." }], // Starts with 'p' -> P2SH
      hasChange: false
    });

    const expected = KASPA_MASS_CONSTANTS.BASE_TRANSACTION + 
                     KASPA_MASS_CONSTANTS.INPUT_P2PK + 
                     KASPA_MASS_CONSTANTS.SCRIPT_FALLBACK;
    
    expect(result.mass).toBe(expected);
  });

  it("should be deterministic across runs", () => {
    const params = {
      inputCount: 5,
      outputs: [{ address: "addr1" }, { address: "addr2" }],
      hasChange: true
    };

    const res1 = estimateTransactionMass(params);
    const res2 = estimateTransactionMass(params);

    expect(res1.mass).toBe(res2.mass);
    expect(res1).toEqual(res2);
  });

  it("should maintain same mass after 1 sompi mutation if structure is unchanged", () => {
    const utxos = [
      createMockUtxo({ address: "kaspa:qalice", amountSompi: 5000n })
    ];

    const plan1 = buildPaymentPlan({
      fromAddress: "kaspa:qalice",
      outputs: [{ address: "kaspa:qbob", amountSompi: 500n }],
      availableUtxos: utxos,
      feeRateSompiPerMass: 1n
    });

    const plan2 = buildPaymentPlan({
      fromAddress: "kaspa:qalice",
      outputs: [{ address: "kaspa:qbob", amountSompi: 501n }], // 1 sompi mutation
      availableUtxos: utxos,
      feeRateSompiPerMass: 1n
    });

    expect(plan1.estimatedMass).toBe(plan2.estimatedMass);
    expect(plan1.estimatedFeeSompi).toBe(plan2.estimatedFeeSompi);
    // Note: In a real artifact test, we would check that contentHash is different
  });

  it("should emit explicit best-effort warning for P2SH", () => {
    const result = estimateTransactionMass({
      inputCount: 1,
      outputs: [{ address: "kaspa:ppvkp8f..." }], // P2SH
      hasChange: false
    });

    expect(result.warnings).toContain("P2SH/Other script detected for address: kaspa:ppvkp8f.... Mass is estimated using placeholder script-size assumptions.");
  });
});
