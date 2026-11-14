import { systemRuntimeContext } from "@hardkas/core";
import { describe, it, expect } from "vitest";
import {
  verifyFeeSemantics,
  recomputeMass
} from "../src/index.js";
import { createTxPlanArtifact } from "../src/tx-plan.js";
import { asNetworkId } from "@hardkas/core";

describe("Fee Correctness (Fase 1 Hardening)", () => {
  // 1 input, recipient + change, relayable amounts: kaspa-wasm 2.0.1 prices this
  // shape at 2036 grams (the mass rusty-kaspad reported for the rc17 fixture).
  const basePlan = {
    inputs: [
      {
        outpoint: { transactionId: "tx1", index: 0 },
        amountSompi: 100_000_000_000n,
        address: "kaspa:qalice",
        scriptPublicKey: "00".repeat(34)
      }
    ],
    outputs: [{ address: "kaspa:qbob", amountSompi: 50_000_000_000n }],
    change: { address: "kaspa:qalice", amountSompi: 100_000_000_000n - 50_000_000_000n - 203_600n },
    estimatedFeeSompi: 203_600n,
    estimatedMass: 2036n
  };

  it("should recompute correct mass for a standard plan", () => {
    const artifact = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulator",
      from: { input: "alice", address: "kaspa:qalice" },
      to: { input: "bob", address: "kaspa:qbob" },
      amountSompi: 50_000_000_000n,
      plan: basePlan as any
    });

    const mass = recomputeMass(artifact);
    expect(mass).toBe(2036n);
  });

  it("should pass verification for a valid fee artifact", () => {
    const artifact = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulator",
      from: { input: "alice", address: "kaspa:qalice" },
      to: { input: "bob", address: "kaspa:qbob" },
      amountSompi: 50_000_000_000n,
      plan: basePlan as any
    });

    const audit = verifyFeeSemantics(artifact);
    expect(audit.ok).toBe(true);
    expect(audit.issues).toHaveLength(0);
  });

  it("should fail when mass is mutated", () => {
    const artifact = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulator",
      from: { input: "alice", address: "kaspa:qalice" },
      to: { input: "bob", address: "kaspa:qbob" },
      amountSompi: 50_000_000_000n,
      plan: { ...basePlan, estimatedMass: 500n } as any
    });

    const audit = verifyFeeSemantics(artifact);
    expect(audit.ok).toBe(false);
    expect(audit.issues).toContain("Mass mismatch: artifact reports 500, recomputed 2036");
  });

  it("should fail on negative fee", () => {
    const artifact = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulator",
      from: { input: "alice", address: "kaspa:qalice" },
      to: { input: "bob", address: "kaspa:qbob" },
      amountSompi: 50_000_000_000n,
      plan: { ...basePlan, estimatedFeeSompi: -10n } as any
    });

    const audit = verifyFeeSemantics(artifact);
    expect(audit.ok).toBe(false);
    expect(audit.issues).toContain("Economic violation: Negative fee detected");
  });

  it("should fail on input/output imbalance", () => {
    // Inputs (1000 KAS) < Outputs (500 KAS) + Change (600 KAS) + Fee
    const artifact = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulator",
      from: { input: "alice", address: "kaspa:qalice" },
      to: { input: "bob", address: "kaspa:qbob" },
      amountSompi: 50_000_000_000n,
      plan: {
        ...basePlan,
        change: { address: "kaspa:qalice", amountSompi: 60_000_000_000n }
      } as any
    });

    const audit = verifyFeeSemantics(artifact);
    expect(audit.ok).toBe(false);
    expect(audit.issues.some((i) => i.includes("Economic violation: Total inputs"))).toBe(
      true
    );
  });

  it("B5 · a v0 plan whose stated fee is lower than what it pays fails (inputs must equal outputs + change + fee, as for v1)", () => {
    // 1000 KAS in, 500 KAS out, no change, a stated fee of 203600 sompi: the transaction would really pay ~500 KAS
    const artifact = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulator",
      from: { input: "alice", address: "kaspa:qalice" },
      to: { input: "bob", address: "kaspa:qbob" },
      amountSompi: 50_000_000_000n,
      plan: { ...basePlan, change: undefined } as any
    });
    const audit = verifyFeeSemantics(artifact);
    expect(audit.ok).toBe(false);
    expect(audit.issues).toContain(`Fee mismatch: artifact reports 203600, its inputs minus outputs and change pay ${100_000_000_000n - 50_000_000_000n}`);
    // the balanced plan of the same shape still passes (see "should pass verification for a valid fee artifact")
  });

  it("should fail on dust outputs", () => {
    const artifact = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulator",
      from: { input: "alice", address: "kaspa:qalice" },
      to: { input: "bob", address: "kaspa:qbob" },
      amountSompi: 50_000_000_000n,
      plan: {
        ...basePlan,
        outputs: [{ address: "kaspa:qbob", amountSompi: 100n }] // 100 < 600
      } as any
    });

    const audit = verifyFeeSemantics(artifact);
    expect(audit.ok).toBe(false);
    expect(audit.issues.some((i) => i.includes("Dust output detected"))).toBe(true);
  });
});
