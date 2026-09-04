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
    // Base: 86
    // 1 Input P2PK: 1110
    // 1 Output P2PK: 420
    // Total Mass: 1616
    // FeeRate: 1 (bumped to 100 floor)
    // Fee: 161600
    expect(result.estimatedMass).toBe(1616n);
    expect(result.estimatedFeeSompi).toBe(161600n);
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
    // Base: 86
    // 10 Inputs: 11100
    // 2 Outputs: 840
    // Total Mass: 12026
    // FeeRate: 2 (bumped to 100)
    // Fee: 1202600
    expect(result.estimatedMass).toBe(12026n);
    expect(result.estimatedFeeSompi).toBe(1202600n);
  });

  it("with change output", () => {
    const result = estimateFee({
        inputs: 2,
        outputs: 1,
        feeRateSompiPerMass: 1n,
        policy: "minimal",
        hasChange: true
    });
    // Base: 86
    // 2 Inputs: 2220
    // 1 Output: 420
    // Change Output: 420
    // Total Mass: 3146
    // Fee: 314600
    expect(result.estimatedMass).toBe(3146n);
    expect(result.estimatedFeeSompi).toBe(314600n);
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
