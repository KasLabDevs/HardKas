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
    // Base: 102
    // 1 Input P2PK: 1110
    // 1 Output P2PK: 420
    // Total Mass: 1632
    // FeeRate: 1 (bumped to 100 floor)
    // Fee: 163200
    expect(result.estimatedMass).toBe(1632n);
    expect(result.estimatedFeeSompi).toBe(163200n);
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
    // Base: 102
    // 10 Inputs: 11100
    // 2 Outputs: 840
    // Total Mass: 12042
    // FeeRate: 2 (bumped to 100)
    // Fee: 1204200
    expect(result.estimatedMass).toBe(12042n);
    expect(result.estimatedFeeSompi).toBe(1204200n);
  });

  it("with change output", () => {
    const result = estimateFee({
        inputs: 2,
        outputs: 1,
        feeRateSompiPerMass: 1n,
        policy: "minimal",
        hasChange: true
    });
    // Base: 102
    // 2 Inputs: 2220
    // 1 Output: 420
    // Change Output: 420
    // Total Mass: 3162
    // Fee: 316200
    expect(result.estimatedMass).toBe(3162n);
    expect(result.estimatedFeeSompi).toBe(316200n);
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
