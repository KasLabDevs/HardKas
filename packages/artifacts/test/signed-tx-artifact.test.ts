import { describe, it, expect } from "vitest";
import {
  calculateContentHash,
  createSimulatedSignedTxArtifact,
  validateSignedTxArtifact,
  HARDKAS_VERSION,
  ARTIFACT_SCHEMAS,
  ARTIFACT_VERSION,
  CURRENT_HASH_VERSION
} from "../src/index.js";
import { asNetworkId, systemRuntimeContext } from "@hardkas/core";

describe("SignedTxArtifact", () => {
  const mockPlan: any = {
    schema: ARTIFACT_SCHEMAS.TX_PLAN,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    createdAt: new Date().toISOString(),
    networkId: asNetworkId("simnet"),
    mode: "simulator",
    execution: { mode: "simulator", domain: "kaspa-l1", network: "simnet" },
    planId: "p123",
    from: { address: "addr1" },
    to: { address: "addr2" },
    amountSompi: "500",
    inputs: [],
    outputs: [],
    estimatedMass: "350",
    estimatedFeeSompi: "10"
  };

  /** Wave 1.4 · IC-6′: only a plan with a FULL identity can be authorized. */
  function sealedPlan(): any {
    const plan: any = { ...mockPlan, hashVersion: CURRENT_HASH_VERSION };
    plan.contentHash = calculateContentHash(plan, CURRENT_HASH_VERSION);
    return plan;
  }

  it("should generate a stable hash for the same artifact", () => {
    const hash1 = calculateContentHash(mockPlan as any);
    const hash2 = calculateContentHash(mockPlan as any);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("should generate different hashes for different artifacts", () => {
    const hash1 = calculateContentHash(mockPlan as any);
    const mockPlan2 = { ...mockPlan, amountSompi: "501" };
    const hash2 = calculateContentHash(mockPlan2 as any);
    expect(hash1).not.toBe(hash2);
  });

  it("should create a synthetic authorization of the plan (never a signature)", () => {
    const plan = sealedPlan();
    const signed = createSimulatedSignedTxArtifact(plan, plan.from.address, systemRuntimeContext);

    expect(signed.schema).toBe(ARTIFACT_SCHEMAS.SIGNED_TX);
    expect(signed.status).toBe("signed");
    expect(signed.signedTransaction?.format).toBe("synthetic-authorization");
    expect(signed.signedTransaction?.payload).toBe(plan.contentHash);
    expect(signed.txId).toBe(`synthetic-${plan.contentHash}`);
    expect(signed.sourcePlanId).toBe(mockPlan.planId);
  });

  it("should validate a correct signed artifact", () => {
    const plan = sealedPlan();
    const signed = createSimulatedSignedTxArtifact(plan, plan.from.address, systemRuntimeContext);

    const result = validateSignedTxArtifact(signed);
    if (!result.ok) console.log(result.errors);
    expect(result.ok).toBe(true);
  });

  it("should fail validation for invalid signed artifact", () => {
    const invalid = {
      schema: ARTIFACT_SCHEMAS.SIGNED_TX,
      hardkasVersion: HARDKAS_VERSION,
      status: "unsigned"
    };
    const result = validateSignedTxArtifact(invalid);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Invalid status: expected 'signed'");
  });
});
