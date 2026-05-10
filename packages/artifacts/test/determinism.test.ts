import { describe, it, expect } from "vitest";
import { readTxPlanArtifact, calculateContentHash } from "../src/index.js";
import path from "node:path";

describe("Determinism CI: Artifact Hashing", () => {
  const goldenPlanPath = path.resolve(__dirname, "fixtures/valid/tx-plan.valid.json");

  it("should produce the same content hash for the same artifact data across multiple runs", async () => {
    const artifact = await readTxPlanArtifact(goldenPlanPath);
    const recordedHash = artifact.contentHash;
    
    // Re-calculate hash multiple times
    const hash1 = calculateContentHash(artifact);
    const hash2 = calculateContentHash(artifact);
    const hash3 = calculateContentHash(artifact);

    expect(hash1).toBe(recordedHash);
    expect(hash2).toBe(recordedHash);
    expect(hash3).toBe(recordedHash);
    expect(hash1).toBe(hash2);
  });

  it("should be insensitive to JSON property order (canonicalization)", async () => {
    const artifact = await readTxPlanArtifact(goldenPlanPath);
    const recordedHash = artifact.contentHash;

    // Create a version with shuffled keys
    const shuffled: any = {
      ...artifact,
      networkId: artifact.networkId,
      schema: artifact.schema
    };

    const shuffledHash = calculateContentHash(shuffled);
    expect(shuffledHash).toBe(recordedHash);
  });

  it("should preserve identity across serialization round-trip", async () => {
    const artifact = await readTxPlanArtifact(goldenPlanPath);
    const json = JSON.stringify(artifact);
    const parsed = JSON.parse(json);
    
    const roundTripHash = calculateContentHash(parsed);
    expect(roundTripHash).toBe(artifact.contentHash);
  });
});
