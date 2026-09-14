import { describe, it, expect } from "vitest";
import { estimateFee } from "../src/fee-estimator.js";
import { estimateTransactionMass } from "../src/mass.js";

// Mass comes from the pinned SDK; these tests check the estimator's policy
// (rate floor, conservative margin) on top of it.
const sdkMass = (inputCount: number, outputs: number, hasChange = false) =>
  estimateTransactionMass({
    inputCount,
    outputs: Array.from({ length: outputs }, () => ({ address: "kaspatest:qdummy" })),
    hasChange
  });

describe("FeeEstimator", () => {
  it("one input one output", () => {
    const result = estimateFee({
        inputs: 1,
        outputs: 1,
        feeRateSompiPerMass: 1n,
        policy: "minimal",
        hasChange: false
    });
    // 1 P2PK input + 1 P2PK output, per kaspa-wasm 2.0.1. Rate 1 is raised to the 100 floor.
    expect(result.estimatedMass).toBe(1624n);
    expect(result.estimatedFeeSompi).toBe(162400n);
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
    const expected = sdkMass(10, 2);
    expect(result.estimatedMass).toBe(expected.mass);
    expect(result.estimatedFeeSompi).toBe(expected.feeSompi);
  });

  it("with change output", () => {
    const result = estimateFee({
        inputs: 2,
        outputs: 1,
        feeRateSompiPerMass: 1n,
        policy: "minimal",
        hasChange: true
    });
    const expected = sdkMass(2, 1, true);
    expect(result.estimatedMass).toBe(expected.mass);
    expect(result.estimatedFeeSompi).toBe(expected.feeSompi);
  });

  it("a rate above the floor scales the fee, never below the SDK minimum", () => {
    const result = estimateFee({ inputs: 1, outputs: 1, feeRateSompiPerMass: 300n, policy: "minimal", hasChange: false });
    expect(result.estimatedFeeSompi).toBe(1624n * 300n);
    expect(result.relayFloorSompi).toBe(162400n);
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
