import { describe, it, expect, beforeAll } from "vitest";
import { Hardkas } from "../src/index.js";
import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  generateMigrationReceipt,
  migrateArtifactPayload,
  MigrationRequiredError
} from "@hardkas/artifacts";
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
    (oldArtifact as any).contentHash = calculateContentHash(
      oldArtifact,
      CURRENT_HASH_VERSION
    );
    (oldArtifact as any).lineage.artifactId = (oldArtifact as any).contentHash;
    (oldArtifact as any).lineage.rootArtifactId = (oldArtifact as any).contentHash;

    const migratedResult = migrateArtifactPayload(oldArtifact, "1.0.0-alpha");
    expect(migratedResult.migrated).toBe(true);

    const receipt = generateMigrationReceipt(
      oldArtifact,
      migratedResult.artifact,
      "mig-084-test"
    );

    // The receipt must be valid
    expect(receipt.schema).toBe("hardkas.migrationReceipt.v1");
    expect(receipt.oldHash).toBe((oldArtifact as any).contentHash);
    expect(receipt.newHash).toBe(migratedResult.artifact.contentHash);

    // The new artifact's parent must be the old artifact (to avoid circular hashes)
    expect((migratedResult.artifact as any).lineage.parentArtifactId).toBe(
      (oldArtifact as any).contentHash
    );

    // The receipt's parent must be the old artifact
    expect(receipt.lineage.parentArtifactId).toBe((oldArtifact as any).contentHash);

    // Verify lineage transition explicitly (using artifacts SDK)
    const { verifyLineage } = await import("@hardkas/artifacts");
    const receiptLineageOk = verifyLineage(receipt, oldArtifact, { strict: true });
    expect(receiptLineageOk.ok).toBe(true);

    const artifactLineageOk = verifyLineage(migratedResult.artifact, oldArtifact, {
      strict: true
    });
    expect(artifactLineageOk.ok).toBe(true);
  });

  it("should return LEGACY_VALID info for v3 artifact on normal verify", async () => {
    const v3Artifact = {
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha",
      hashVersion: 3,
      networkId: "simnet",
      mode: "simulated",
      from: "alice",
      to: "bob",
      amountSompi: "100"
    };
    (v3Artifact as any).contentHash = calculateContentHash(v3Artifact, 3);

    const { verifyArtifactIntegritySync } = await import("@hardkas/artifacts");
    const result = verifyArtifactIntegritySync(v3Artifact);

    // Normal verify passes
    expect(result.ok).toBe(true);
    // But logs an info issue
    expect(result.issues.some((i: any) => i.code === "LEGACY_VALID")).toBe(true);
  });

  it("should fail strict verify with LEGACY_HASH_VERSION_UNSAFE for v3 artifact", async () => {
    const v3Artifact = {
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha",
      hashVersion: 3,
      networkId: "simnet",
      mode: "simulated",
      from: "alice",
      to: "bob",
      amountSompi: "100"
    };
    (v3Artifact as any).contentHash = calculateContentHash(v3Artifact, 3);

    const { verifyArtifactIntegritySync } = await import("@hardkas/artifacts");
    const result = verifyArtifactIntegritySync(v3Artifact, { strict: true });

    // Strict verify fails
    expect(result.ok).toBe(false);
    expect(result.issues.some((i: any) => i.code === "LEGACY_HASH_VERSION_UNSAFE")).toBe(
      true
    );
  });

  it("should fail with HASH_MISMATCH when audit metadata is mutated in v4", async () => {
    const v4Artifact = {
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha",
      hashVersion: 4,
      networkId: "simnet",
      mode: "simulated",
      lineage: {
        sequence: 1,
        rootArtifactId:
          "0000000000000000000000000000000000000000000000000000000000000000",
        lineageId: "0000000000000000000000000000000000000000000000000000000000000000"
      }
    };
    (v4Artifact as any).contentHash = calculateContentHash(v4Artifact, 4);

    // Mutate the audit-critical metadata (previously excluded in v3, now included in v4)
    const mutated = JSON.parse(JSON.stringify(v4Artifact));
    mutated.lineage.sequence = 100;

    const { verifyArtifactIntegritySync } = await import("@hardkas/artifacts");
    const result = verifyArtifactIntegritySync(mutated, { strict: true });

    // Fails due to HASH_MISMATCH because lineage is no longer completely excluded in v4
    expect(result.ok).toBe(false);
    expect(result.issues.some((i: any) => i.code === "ARTIFACT_HASH_MISMATCH")).toBe(true);
  });
});
