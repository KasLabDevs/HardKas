import { systemRuntimeContext } from "@hardkas/core";
import { describe, it, expect } from "vitest";
import {
  verifyFeeSemantics,
  recomputeMass
} from "../src/index.js";
import { createTxPlanArtifact } from "../src/tx-plan.js";
import { asNetworkId } from "@hardkas/core";

describe("Fee Correctness (Fase 1 Hardening)", () => {
  const basePlan = {
    inputs: [
      {
        outpoint: { transactionId: "tx1", index: 0 },
        amountSompi: 10000n,
        address: "kaspa:qalice",
        scriptPublicKey: "00".repeat(34)
      }
    ],
    outputs: [{ address: "kaspa:qbob", amountSompi: 5000n }],
    change: { address: "kaspa:qalice", amountSompi: 3940n },
    estimatedFeeSompi: 1060n,
    estimatedMass: 1060n // 100 + (1 × 160) + 400 + 400 = 1060
  };

  it("should recompute correct mass for a standard plan", () => {
    const artifact = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulated",
      from: { input: "alice", address: "kaspa:qalice" },
      to: { input: "bob", address: "kaspa:qbob" },
      amountSompi: 5000n,
      plan: basePlan as any
    });

    const mass = recomputeMass(artifact);
    expect(mass).toBe(1060n);
  });

  it("should pass verification for a valid fee artifact", () => {
    const artifact = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulated",
      from: { input: "alice", address: "kaspa:qalice" },
      to: { input: "bob", address: "kaspa:qbob" },
      amountSompi: 5000n,
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
      mode: "simulated",
      from: { input: "alice", address: "kaspa:qalice" },
      to: { input: "bob", address: "kaspa:qbob" },
      amountSompi: 5000n,
      plan: { ...basePlan, estimatedMass: 500n } as any
    });

    const audit = verifyFeeSemantics(artifact);
    expect(audit.ok).toBe(false);
    expect(audit.issues).toContain("Mass mismatch: artifact reports 500, recomputed 1060");
  });

  it("should fail on negative fee", () => {
    const artifact = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulated",
      from: { input: "alice", address: "kaspa:qalice" },
      to: { input: "bob", address: "kaspa:qbob" },
      amountSompi: 5000n,
      plan: { ...basePlan, estimatedFeeSompi: -10n } as any
    });

    const audit = verifyFeeSemantics(artifact);
    expect(audit.ok).toBe(false);
    expect(audit.issues).toContain("Economic violation: Negative fee detected");
  });

  it("should fail on input/output imbalance", () => {
    // Inputs (10000) < Outputs (5000) + Change (6000) + Fee (350) = 11350
    const artifact = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulated",
      from: { input: "alice", address: "kaspa:qalice" },
      to: { input: "bob", address: "kaspa:qbob" },
      amountSompi: 5000n,
      plan: {
        ...basePlan,
        change: { address: "kaspa:qalice", amountSompi: 6000n }
      } as any
    });

    const audit = verifyFeeSemantics(artifact);
    expect(audit.ok).toBe(false);
    expect(audit.issues.some((i) => i.includes("Economic violation: Total inputs"))).toBe(
      true
    );
  });

  it("should fail on dust outputs", () => {
    const artifact = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: asNetworkId("simnet") as any,
      mode: "simulated",
      from: { input: "alice", address: "kaspa:qalice" },
      to: { input: "bob", address: "kaspa:qbob" },
      amountSompi: 5000n,
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
