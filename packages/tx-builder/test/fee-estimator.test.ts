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
    // 1 Input P2PK: 160
    // 1 Output P2PK: 400
    // Total Mass: 660
    // FeeRate: 1
    // Fee: 660
    expect(result.estimatedMass).toBe(660n);
    expect(result.estimatedFeeSompi).toBe(660n);
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
    // 10 Inputs: 1600
    // 2 Outputs: 800
    // Total Mass: 2500
    // FeeRate: 2
    // Fee: 5000
    expect(result.estimatedMass).toBe(2500n);
    expect(result.estimatedFeeSompi).toBe(5000n);
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
    // 2 Inputs: 320
    // 1 Output: 400
    // Change Output: 400
    // Total Mass: 1220
    // Fee: 1220
    expect(result.estimatedMass).toBe(1220n);
    expect(result.estimatedFeeSompi).toBe(1220n);
  });

  it("invalid fee rate (float, negative, NaN)", () => {
    const req = { inputs: 1, outputs: 1, policy: "minimal" as const };
    expect(() => estimateFee({ ...req, feeRateSompiPerMass: -1n })).toThrow(/FEE_ESTIMATOR_INVALID_RATE/);
    expect(() => estimateFee({ ...req, feeRateSompiPerMass: 1.5 as any })).toThrow(/FEE_ESTIMATOR_INVALID_RATE/);
    expect(() => estimateFee({ ...req, feeRateSompiPerMass: NaN as any })).toThrow(/FEE_ESTIMATOR_INVALID_RATE/);
    expect(() => estimateFee({ ...req, feeRateSompiPerMass: Infinity as any })).toThrow(/FEE_ESTIMATOR_INVALID_RATE/);
    expect(() => estimateFee({ ...req, feeRateSompiPerMass: "1.123" as any })).toThrow(/FEE_ESTIMATOR_INVALID_RATE/);
    expect(() => estimateFee({ ...req, feeRateSompiPerMass: "abc" as any })).toThrow(/FEE_ESTIMATOR_INVALID_RATE/);
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
