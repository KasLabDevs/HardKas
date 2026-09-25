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
      mode: "rpc"
    };

    expect(() => {
      migrateArtifactPayload(legacyArtifact, "1.0.0-alpha", { strictPolicy: true });
    }).toThrow(MigrationRequiredError);
  });

  it("should generate a valid migration receipt and link lineage", async () => {
    // Wave 1.3 re-base (D-Q1.f / IC-4′.7): a migration starts from a VERIFIED legacy
    // source. The former fixture declared no hashVersion (unverifiable, IC-4′.2) and a
    // non-hex lineage. This is a v4 legacy plan exactly as rc.22 wrote it (two-pass
    // root lineage), whose lineage v4 authenticated, so the migrated child carries it.
    const oldArtifact: any = {
      schema: "hardkas.txPlan.v1",
      version: "0.1.0",
      hashVersion: 4,
      hardkasVersion: "0.12.0-rc.22",
      networkId: "simnet",
      mode: "simulator",
      createdAt: new Date().toISOString(),
      from: { address: "kaspasim:qqalice" },
      to: { address: "kaspasim:qqbob" },
      amountSompi: "100",
      estimatedFeeSompi: "1",
      estimatedMass: "1",
      inputs: [],
      outputs: [],
      workflowId: "wf_0000000000000000",
      assumptionLevel: "local-simulated"
    };
    const firstPass = calculateContentHash(oldArtifact, 4);
    oldArtifact.lineage = { artifactId: "", lineageId: firstPass, parentArtifactId: "", rootArtifactId: firstPass, sequence: 1 };
    oldArtifact.contentHash = calculateContentHash(oldArtifact, 4);
    oldArtifact.lineage.artifactId = oldArtifact.contentHash;

    const migratedResult = migrateArtifactPayload(oldArtifact, "1.0.0-alpha");
    expect(migratedResult.artifact.hashVersion).toBe(CURRENT_HASH_VERSION);
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

  it("should verify a v3 artifact under its own rules with authScope LEGACY on normal verify", async () => {
    // Wave 1.1 · D-Q1.e / IC-4′.3: non-strict verification of v≤4 reports
    // `authScope: "LEGACY"` plus an info issue (LEGACY_AUTH_SCOPE) naming the material
    // fields that version never authenticated. The former LEGACY_VALID code is gone.
    const v3Artifact = {
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha",
      hashVersion: 3,
      networkId: "simnet",
      mode: "simulator",
      from: "alice",
      to: "bob",
      amountSompi: "100"
    };
    (v3Artifact as any).contentHash = calculateContentHash(v3Artifact, 3);

    const { verifyArtifactIntegritySync } = await import("@hardkas/artifacts");
    const result = verifyArtifactIntegritySync(v3Artifact);

    expect(result.issues.some((i: any) => i.code === "ARTIFACT_HASH_MISMATCH")).toBe(false);
    expect(result.authScope).toBe("LEGACY");
    expect(result.issues.some((i: any) => i.code === "LEGACY_AUTH_SCOPE" && i.severity === "info")).toBe(true);
  });

  it("should fail strict verify with MIGRATION_REQUIRED for v3 artifact", async () => {
    // Wave 1.1 · IC-4′.3: strict requires hashVersion 5; v≤4 → MIGRATION_REQUIRED
    // (replaces the former LEGACY_HASH_VERSION_UNSAFE, which only flagged v<4).
    const v3Artifact = {
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha",
      hashVersion: 3,
      networkId: "simnet",
      mode: "simulator",
      from: "alice",
      to: "bob",
      amountSompi: "100"
    };
    (v3Artifact as any).contentHash = calculateContentHash(v3Artifact, 3);

    const { verifyArtifactIntegritySync } = await import("@hardkas/artifacts");
    const result = verifyArtifactIntegritySync(v3Artifact, { strict: true });

    // Strict verify fails
    expect(result.ok).toBe(false);
    expect(result.authScope).toBe("LEGACY");
    expect(result.issues.some((i: any) => i.code === "MIGRATION_REQUIRED")).toBe(true);
  });

  it("should fail with HASH_MISMATCH when audit metadata is mutated in v4", async () => {
    const v4Artifact = {
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha",
      hashVersion: 4,
      networkId: "simnet",
      mode: "simulator",
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
