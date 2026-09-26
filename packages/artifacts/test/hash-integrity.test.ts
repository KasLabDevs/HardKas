import { describe, it, expect } from "vitest";
import { verifyArtifactIntegrity } from "../src/verify.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../src/canonical.js";

// Wave 1.1 · IC-1′.3 / IC-4′.2: an artifact declares the hashVersion it was hashed
// with; without it verification fails closed (HASH_VERSION_INVALID) before any hash
// comparison, so these fixtures declare it to keep proving the hash properties.
describe("Artifact Hash Integrity", () => {
  it("should fail validation if contentHash is missing", async () => {
    const artifact = {
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha",
      hashVersion: CURRENT_HASH_VERSION,
      amountSompi: "100"
      // missing contentHash
    };

    const result = await verifyArtifactIntegrity(artifact);
    expect(result.ok).toBe(false);
    expect(result.issues.at(0)?.code).toBe("MISSING_CONTENT_HASH");
  });

  it("should fail validation if contentHash mismatches payload", async () => {
    const artifact: any = {
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha",
      hashVersion: CURRENT_HASH_VERSION,
      amountSompi: "100",
      from: { address: "kaspa:sim_alice" },
      to: { address: "kaspa:sim_bob" }
    };

    // Set correct hash first
    artifact.contentHash = calculateContentHash(artifact);

    // Tamper the payload
    artifact.amountSompi = "200";

    const result = await verifyArtifactIntegrity(artifact);
    expect(result.ok).toBe(false);
    expect(result.issues.at(0)?.code).toBe("ARTIFACT_HASH_MISMATCH");
    expect(result.actualHash).toBeDefined();
    expect(result.expectedHash).toBeDefined();
    expect(result.actualHash).not.toBe(result.expectedHash);
  });

  it("should pass validation if JSON keys are reordered", async () => {
    const artifact: any = {
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha",
      hashVersion: CURRENT_HASH_VERSION,
      amountSompi: "100",
      from: { address: "kaspa:sim_alice" },
      to: { address: "kaspa:sim_bob" }
    };

    artifact.contentHash = calculateContentHash(artifact);

    // Reorder keys
    const reordered: any = {
      to: artifact.to,
      from: artifact.from,
      amountSompi: artifact.amountSompi,
      hashVersion: artifact.hashVersion,
      version: artifact.version,
      schema: artifact.schema,
      contentHash: artifact.contentHash
    };

    const result = await verifyArtifactIntegrity(reordered);
    // Note: Zod schema validation might still fail if some fields are missing (like inputs/outputs),
    // but the HASH_MISMATCH should NOT be present.
    const hasHashError = result.issues.some((i) => i.code === "ARTIFACT_HASH_MISMATCH");
    expect(hasHashError).toBe(false);
  });

  it("should not recursively hash contentHash", async () => {
    const artifact: any = {
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha"
    };

    const hash1 = calculateContentHash(artifact);
    artifact.contentHash = hash1;

    const hash2 = calculateContentHash(artifact);
    expect(hash1).toBe(hash2);
  });
});
