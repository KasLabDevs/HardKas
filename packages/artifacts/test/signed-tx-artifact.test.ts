import { describe, it, expect } from "vitest";
import { 
  calculateContentHash, 
  createTxPlanArtifact, 
  createSimulatedSignedTxArtifact, 
  validateSignedTxArtifact,
  HARDKAS_VERSION,
  ARTIFACT_SCHEMAS,
  ARTIFACT_VERSION
} from "../src";

describe("SignedTxArtifact", () => {
  const mockPlan: any = {
    schema: ARTIFACT_SCHEMAS.TX_PLAN,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    createdAt: new Date().toISOString(),
    networkId: "simnet",
    mode: "simulated",
    planId: "p123",
    from: { address: "addr1" },
    to: { address: "addr2" },
    amountSompi: "500",
    inputs: [],
    outputs: [],
    estimatedMass: "350",
    estimatedFeeSompi: "10"
  };

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

  it("should create a simulated signed artifact", () => {
    const signed = createSimulatedSignedTxArtifact(
      mockPlan as any,
      "simulated-payload"
    );

    expect(signed.schema).toBe(ARTIFACT_SCHEMAS.SIGNED_TX);
    expect(signed.status).toBe("signed");
    expect(signed.signedTransaction?.payload).toBe("simulated-payload");
    expect(signed.sourcePlanId).toBe(mockPlan.planId);
  });

  it("should validate a correct signed artifact", () => {
    const signed = createSimulatedSignedTxArtifact(
      mockPlan as any,
      "simulated-payload"
    );

    const result = validateSignedTxArtifact(signed);
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
