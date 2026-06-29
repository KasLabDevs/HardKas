import { describe, it, expect } from "vitest";
import { estimateFee } from "../src/fee-estimator.js";

describe("FeeEstimator", () => {
  it("one input one output", () => {
    const result = estimateFee({
        inputs: 1,
        outputs: 1,
        feeRateSompiPerMass: 1n,
        policy: "minimal",
        hasChange: false
    });
    // Base: 100
    // 1 Input P2PK: 150
    // 1 Output P2PK: 50 (since it defaults to qdummy)
    // Total Mass: 300
    // FeeRate: 1
    // Fee: 300
    expect(result.estimatedMass).toBe(300n);
    expect(result.estimatedFeeSompi).toBe(300n);
    expect(result.estimated).toBe(true);
    expect(result.claims.exactNetworkFee).toBe(false);
  });

  it("many inputs", () => {
    const result = estimateFee({
        inputs: 10,
        outputs: 2,
        feeRateSompiPerMass: 2n,
        policy: "minimal"
    });
    // Base: 100
    // 10 Inputs: 1500
    // 2 Outputs: 100
    // Total Mass: 1700
    // FeeRate: 2
    // Fee: 3400
    expect(result.estimatedMass).toBe(1700n);
    expect(result.estimatedFeeSompi).toBe(3400n);
  });

  it("with change output", () => {
    const result = estimateFee({
        inputs: 2,
        outputs: 1,
        feeRateSompiPerMass: 1n,
        policy: "minimal",
        hasChange: true
    });
    // Base: 100
    // 2 Inputs: 300
    // 1 Output: 50
    // Change Output: 50
    // Total Mass: 500
    // Fee: 500
    expect(result.estimatedMass).toBe(500n);
    expect(result.estimatedFeeSompi).toBe(500n);
  });

  it("invalid fee rate (float, negative, NaN)", () => {
    const req = { inputs: 1, outputs: 1, policy: "minimal" as const };
    expect(() => estimateFee({ ...req, feeRateSompiPerMass: -1n })).toThrow(/FEE_ESTIMATOR_INVALID_RATE/);
    expect(() => estimateFee({ ...req, feeRateSompiPerMass: 1.5 })).toThrow(/FEE_ESTIMATOR_INVALID_RATE/);
    expect(() => estimateFee({ ...req, feeRateSompiPerMass: NaN })).toThrow(/FEE_ESTIMATOR_INVALID_RATE/);
    expect(() => estimateFee({ ...req, feeRateSompiPerMass: Infinity })).toThrow(/FEE_ESTIMATOR_INVALID_RATE/);
    expect(() => estimateFee({ ...req, feeRateSompiPerMass: "1.123" })).toThrow(/FEE_ESTIMATOR_INVALID_RATE/);
    expect(() => estimateFee({ ...req, feeRateSompiPerMass: "abc" })).toThrow(/FEE_ESTIMATOR_INVALID_RATE/);
  });

  it("deterministic output", () => {
    const result1 = estimateFee({ inputs: 5, outputs: 3, feeRateSompiPerMass: 5n, policy: "conservative" });
    const result2 = estimateFee({ inputs: 5, outputs: 3, feeRateSompiPerMass: 5n, policy: "conservative" });
    
    expect(result1.estimatedFeeSompi).toBe(result2.estimatedFeeSompi);
    expect(result1.estimatedMass).toBe(result2.estimatedMass);
  });

  it("conservative >= minimal", () => {
    const minimal = estimateFee({ inputs: 2, outputs: 2, feeRateSompiPerMass: 10n, policy: "minimal" });
    const conservative = estimateFee({ inputs: 2, outputs: 2, feeRateSompiPerMass: 10n, policy: "conservative" });
    
    expect(conservative.estimatedFeeSompi).toBeGreaterThan(minimal.estimatedFeeSompi);
    
    // Check conservative logic exactly: (minimalFee * 110n + 99n) / 100n
    const expectedConservativeFee = (minimal.estimatedFeeSompi * 110n + 99n) / 100n;
    expect(conservative.estimatedFeeSompi).toBe(expectedConservativeFee);
  });
});
