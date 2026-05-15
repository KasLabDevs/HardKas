import { describe, it, expect } from "vitest";
import { verifyLineage } from "../src/index.js";

describe("Artifact Lineage Hardening", () => {
  const rootHash = "a4bf569a1559b4d1832552b588e8c92c7d95081ab11feb08ad2de7bc0f451665";
  const planHash = "9b3b51f88adaec104835d60b3275fad12ff1851eeb5b88590a9889a880a267b1";
  const flowId = "5e001eec361ca9a8098fb0266419bee20116585c03746ecc8d1e0ec1cc567f13";

  const rootArtifact = {
    schema: "hardkas.snapshot",
    contentHash: rootHash,
    networkId: "simnet",
    mode: "simulated",
    lineage: {
      artifactId: rootHash,
      lineageId: flowId,
      rootArtifactId: rootHash,
      sequence: 0
    }
  };

  const planArtifact = {
    schema: "hardkas.txPlan",
    contentHash: planHash,
    networkId: "simnet",
    mode: "simulated",
    lineage: {
      artifactId: planHash,
      lineageId: flowId,
      parentArtifactId: rootHash,
      rootArtifactId: rootHash,
      sequence: 1
    }
  };

  it("should pass valid lineage chain", () => {
    const result = verifyLineage(planArtifact, rootArtifact);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("should fail if parent provided but child is missing parentArtifactId", () => {
    const orphan = {
      ...planArtifact,
      lineage: { ...planArtifact.lineage, parentArtifactId: undefined }
    };
    const result = verifyLineage(orphan, rootArtifact);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "MISSING_PARENT_ID")).toBe(true);
  });

  it("should fail on lineageId mismatch", () => {
    const corrupted = {
      ...planArtifact,
      lineage: { ...planArtifact.lineage, lineageId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
    };
    const result = verifyLineage(corrupted, rootArtifact);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "LINEAGE_ID_MISMATCH")).toBe(true);
  });

  it("should fail on rootId mismatch", () => {
    const corrupted = {
      ...planArtifact,
      lineage: { ...planArtifact.lineage, rootArtifactId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }
    };
    const result = verifyLineage(corrupted, rootArtifact);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "ROOT_ARTIFACT_ID_MISMATCH")).toBe(true);
  });

  it("should fail on parent hash mismatch", () => {
    const corrupted = {
      ...planArtifact,
      lineage: { ...planArtifact.lineage, parentArtifactId: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" }
    };
    const result = verifyLineage(corrupted, rootArtifact);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "PARENT_ID_MISMATCH")).toBe(true);
  });

  it("should WARN but not fail on non-monotonic sequence", () => {
    const corrupted = {
      ...planArtifact,
      lineage: { ...planArtifact.lineage, sequence: 0 } // same as parent
    };
    const result = verifyLineage(corrupted, rootArtifact);
    expect(result.ok).toBe(true); // Warning, not error
    expect(result.issues.some(i => i.code === "NON_MONOTONIC_SEQUENCE" && i.severity === "warning")).toBe(true);
  });

  it("should fail on network mismatch", () => {
    const crossNetwork = {
      ...planArtifact,
      networkId: "mainnet"
    };
    const result = verifyLineage(crossNetwork, rootArtifact);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "NETWORK_MISMATCH")).toBe(true);
  });

  it("should fail on mode mismatch", () => {
    const crossMode = {
      ...planArtifact,
      mode: "real"
    };
    const result = verifyLineage(crossMode, rootArtifact);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "MODE_MISMATCH")).toBe(true);
  });

  it("should fail on self-parent", () => {
    const selfParent = {
      ...rootArtifact,
      lineage: { ...rootArtifact.lineage, parentArtifactId: rootHash }
    };
    const result = verifyLineage(selfParent, rootArtifact);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "SELF_PARENT")).toBe(true);
  });

  it("should fail on invalid transition (e.g. receipt -> plan)", () => {
    const receipt = {
      schema: "hardkas.txReceipt",
      networkId: "simnet",
      mode: "simulated",
      lineage: { artifactId: rootHash, lineageId: flowId, rootArtifactId: rootHash }
    };
    const plan = {
      schema: "hardkas.txPlan",
      networkId: "simnet",
      mode: "simulated",
      lineage: { artifactId: planHash, lineageId: flowId, rootArtifactId: rootHash, parentArtifactId: rootHash }
    };
    // receipt cannot be parent of plan
    const result = verifyLineage(plan, receipt);
    expect(result.ok).toBe(false);
    expect(result.issues.some(i => i.code === "INVALID_TRANSITION")).toBe(true);
  });
});
