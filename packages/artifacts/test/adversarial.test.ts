import { describe, it, expect } from "vitest";
import { verifyArtifactIntegrity, verifyArtifactSemantics } from "../src/verify.js";
import { ARTIFACT_VERSION, CURRENT_HASH_VERSION } from "../src/index.js";
import { calculateContentHash } from "../src/canonical.js";

const AdversarialFixtures = {
  hashMismatch() {
    const artifact: any = {
      schema: "hardkas.txPlan",
      version: ARTIFACT_VERSION,
      networkId: "simnet",
      mode: "simulated",
      amountSompi: "1000",
      estimatedFeeSompi: "1",
      estimatedMass: "1",
      from: { address: "kaspasim:qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
      to: { address: "kaspasim:qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
      inputs: [],
      outputs: [],
      hashVersion: CURRENT_HASH_VERSION
    };
    const realHash = calculateContentHash(artifact, CURRENT_HASH_VERSION);
    artifact.contentHash = "f" + realHash.slice(1); // Tampered
    artifact.artifactId = `plan-${artifact.contentHash.slice(0, 16)}`;
    artifact.planId = artifact.artifactId;
    return artifact;
  },

  crossNetworkLineage() {
    const parent: any = {
      schema: "hardkas.txPlan",
      version: ARTIFACT_VERSION,
      artifactId: "parent-mainnet",
      contentHash: "hash-mainnet",
      networkId: "mainnet",
      mode: "l1-rpc"
    };
    const child: any = {
      schema: "hardkas.signedTx",
      version: ARTIFACT_VERSION,
      artifactId: "child-simnet",
      contentHash: "hash-simnet",
      networkId: "simnet",
      mode: "simulated",
      lineage: { 
        artifactId: "hash-simnet",
        parentArtifactId: "parent-mainnet",
        lineageId: "b".repeat(64),
        rootArtifactId: "c".repeat(64)
      }
    };
    return { parent, child };
  }
};

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
