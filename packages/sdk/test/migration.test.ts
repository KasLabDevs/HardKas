import { describe, it, expect, beforeAll } from "vitest";
import { Hardkas } from "../src/index.js";
import { calculateContentHash, CURRENT_HASH_VERSION, generateMigrationReceipt, migrateArtifactPayload, MigrationRequiredError } from "@hardkas/artifacts";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("Network-Agnostic Artifact Layer: Migration", () => {
  let sdk: Hardkas;
  let workspaceRoot: string;

  beforeAll(async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-test-"));
    sdk = await Hardkas.open({ cwd: workspaceRoot, autoBootstrap: true });
  });

  it("should throw MigrationRequiredError when strictPolicy is applied to legacy artifact", () => {
    const legacyArtifact = {
      schema: "hardkas.txPlan.v1",
      version: "0.1.0",
      networkId: "kaspa-mainnet",
      mode: "real"
    };

    expect(() => {
      migrateArtifactPayload(legacyArtifact, "1.0.0-alpha", { strictPolicy: true });
    }).toThrow(MigrationRequiredError);
  });

  it("should generate a valid migration receipt and link lineage", async () => {
    const oldArtifact = {
      schema: "hardkas.txPlan.v1",
      version: "0.1.0",
      networkId: "simnet",
      mode: "simulated",
      createdAt: new Date().toISOString(),
      lineage: {
        artifactId: "unknown",
        lineageId: "0000000000000000000000000000000000000000000000000000000000000000",
        rootArtifactId: "unknown"
      }
    };
    (oldArtifact as any).contentHash = calculateContentHash(oldArtifact, CURRENT_HASH_VERSION);
    (oldArtifact as any).lineage.artifactId = (oldArtifact as any).contentHash;
    (oldArtifact as any).lineage.rootArtifactId = (oldArtifact as any).contentHash;

    const migratedResult = migrateArtifactPayload(oldArtifact, "1.0.0-alpha");
    expect(migratedResult.migrated).toBe(true);

    const receipt = generateMigrationReceipt(oldArtifact, migratedResult.artifact, "mig-084-test");

    // The receipt must be valid
    expect(receipt.schema).toBe("hardkas.migrationReceipt.v1");
    expect(receipt.oldHash).toBe((oldArtifact as any).contentHash);
    expect(receipt.newHash).toBe(migratedResult.artifact.contentHash);

    // The new artifact's parent must be the receipt
    expect((migratedResult.artifact as any).lineage.parentArtifactId).toBe(receipt.contentHash);

    // The receipt's parent must be the old artifact
    expect(receipt.lineage.parentArtifactId).toBe((oldArtifact as any).contentHash);

    // Verify lineage transition explicitly (using artifacts SDK)
    const { verifyLineage } = await import("@hardkas/artifacts");
    const receiptLineageOk = verifyLineage(receipt, oldArtifact, { strict: true });
    if (!receiptLineageOk.ok) console.log("receiptLineageOk failed:", JSON.stringify(receiptLineageOk.issues, null, 2));
    expect(receiptLineageOk.ok).toBe(true);

    const artifactLineageOk = verifyLineage(migratedResult.artifact, receipt, { strict: true });
    expect(artifactLineageOk.ok).toBe(true);
  });
});
