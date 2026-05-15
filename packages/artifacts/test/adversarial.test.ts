import { describe, it, expect } from "vitest";
import { verifyArtifactIntegrity, verifyArtifactSemantics } from "../src/verify.js";
import { AdversarialFixtures } from "../../testing/src/adversarial-fixtures.js";

describe("PR 7: Adversarial Integrity Validation", () => {
  it("should detect hash mismatch in tampered artifacts", async () => {
    const artifact = AdversarialFixtures.hashMismatch();
    const result = await verifyArtifactIntegrity(artifact);
    
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "ARTIFACT_HASH_MISMATCH")).toBe(true);
  });

  it("should detect cross-network contamination", () => {
    const { parent, child } = AdversarialFixtures.crossNetworkLineage();
    const result = verifyArtifactSemantics(child, { parent });
    
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "NETWORK_MISMATCH")).toBe(true);
  });

  it("should detect self-parenting (simple cycle)", () => {
    const artifact: any = {
      schema: "hardkas.txPlan",
      contentHash: "a".repeat(64),
      networkId: "simnet",
      mode: "simulated",
      lineage: {
        artifactId: "a".repeat(64),
        parentArtifactId: "a".repeat(64),
        lineageId: "b".repeat(64),
        rootArtifactId: "c".repeat(64)
      }
    };
    const result = verifyArtifactSemantics(artifact, { parent: artifact });
    
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "SELF_PARENT")).toBe(true);
  });
  
  // Note: Deep circularity (A -> B -> A) requires multi-artifact verification, 
  // which is typically handled by the CLI or a crawler.
});
