import { describe, it, expect } from "vitest";
import { Hardkas } from "@hardkas/sdk";
import {
  MigrationRequiredError,
  migrateArtifactPayload,
  verifyLineage,
  calculateContentHash
} from "@hardkas/artifacts";

describe("Phase 6B: Backward Compatibility (Vitest Layer 1)", () => {
  it("should enforce SAFE_REJECT_UNSUPPORTED for old schemas via MigrationRequiredError", async () => {
    const sdk = await Hardkas.open({ network: "simnet", autoBootstrap: true });

    // Simulate a 0.8.2 artifact (e.g. without contentHash explicitly set to match new schemas, or old version)
    const legacyArtifact = {
      schema: "hardkas.txPlan.v1",
      hardkasVersion: "0.8.2",
      version: "0.1.0",
      inputs: [],
      outputs: [],
      createdAt: new Date().toISOString()
    };

    let caughtSafeReject = false;
    try {
      await sdk.artifacts.verify(legacyArtifact, { throwOnInvalid: true });
    } catch (e: unknown) {
      if (
        ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)).includes("corrupted or invalid") &&
        ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)).includes("ARTIFACT_SCHEMA_INVALID")
      ) {
        caughtSafeReject = true;
      }
    }

    // Actually, migration engine strict mode
    let caughtMigrationError = false;
    try {
      migrateArtifactPayload(legacyArtifact, "1.0.0-alpha", { strictPolicy: true });
    } catch (e: unknown) {
      if (e instanceof MigrationRequiredError) {
        caughtMigrationError = true;
      }
    }

    expect(caughtSafeReject || caughtMigrationError).toBe(true);
  });

  it("should preserve broken lineage tracking across migrationReceipt", () => {
    // Wave 1.3 re-base (D-Q1.f / IC-4′.7): a migration starts from a VERIFIED legacy
    // source (the former fixture carried a fake contentHash). This is a v4 legacy plan
    // whose lineage v4 authenticated, so its (broken) lineageId/rootArtifactId are
    // carried by the re-issue and the receipt exactly as the test's name says.
    const legacyArtifact: any = {
      schema: "hardkas.txPlan.v1",
      hardkasVersion: "0.8.2",
      version: "0.1.0",
      hashVersion: 4,
      from: { address: "kaspasim:qqalice" },
      to: { address: "kaspasim:qqbob" },
      amountSompi: "10",
      estimatedFeeSompi: "1",
      estimatedMass: "1",
      inputs: [],
      outputs: [],
      networkId: "simnet",
      mode: "simulator",
      createdAt: new Date().toISOString(),
      lineage: {
        artifactId: "",
        lineageId: "b".repeat(64),
        rootArtifactId: "c".repeat(64)
      }
    };
    legacyArtifact.contentHash = calculateContentHash(legacyArtifact, 4);
    legacyArtifact.lineage.artifactId = legacyArtifact.contentHash;

    const { generateMigrationReceipt } = require("@hardkas/artifacts");

    // Migrate
    const migrated = migrateArtifactPayload(legacyArtifact, "1.0.0-alpha");
    expect(migrated.migrated).toBe(true);

    const receipt = generateMigrationReceipt(
      legacyArtifact,
      migrated.artifact,
      "mig-6b-test"
    );

    // Verify receipt links to legacy correctly
    const receiptLineageOk = verifyLineage(receipt, legacyArtifact, { strict: true });
    if (!receiptLineageOk.ok) console.log(receiptLineageOk.issues);
    expect(receiptLineageOk.ok).toBe(true);

    // Verify new artifact links directly to legacy correctly, NOT to receipt
    const newArtifactLineageOk = verifyLineage(migrated.artifact, legacyArtifact, {
      strict: true
    });
    expect(newArtifactLineageOk.ok).toBe(true);

    // Explicit check: oldHash -> migrationReceipt
    // And oldHash -> newHash (receipt is a sidecar)
    expect(receipt.oldHash).toBe(legacyArtifact.contentHash);
    expect(receipt.newHash).toBe(migrated.artifact.contentHash);
    expect(receipt.lineage.parentArtifactId).toBe(legacyArtifact.contentHash);
    expect((migrated.artifact.lineage as any).parentArtifactId).toBe(
      legacyArtifact.contentHash
    );
  });
});
