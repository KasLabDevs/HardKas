import { describe, it, expect } from "vitest";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { CURRENT_HASH_VERSION, calculateContentHash } from "../../src/canonical.js";
import { verifyArtifactIntegritySync } from "../../src/verify.js";
import { verifyLineage } from "../../src/lineage.js";
import { createTxPlanArtifact } from "../../src/tx-plan.js";
import * as migration from "../../src/migration.js";

// Wave 1.3 · Closure Pack D-Q1.f / IC-4′.7 / N13
//   migrate --to 5 creates a NEW artifact plus a MigrationReceipt; nothing is
//   rewritten in place; material fields the source version never authenticated
//   do NOT enter the v5 body as authenticated: they are discarded or kept in a
//   `legacyClaims` block marked as an unverified legacy claim. The receipt's
//   lineage is a valid hexadecimal lineage (N13).

const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };
const codes = (r: { issues: Array<{ code: string }> }) => r.issues.map((i) => i.code);
const api = migration as any;

function makeV5Plan(): any {
  const plan: any = {
    inputs: [{ outpoint: { transactionId: "ab".repeat(32), index: 0 }, amountSompi: 1000n, address: "kaspasim:qqalice", scriptPublicKey: "spk" }],
    outputs: [{ address: "kaspasim:qqbob", amountSompi: 500n }],
    change: { address: "kaspasim:qqalice", amountSompi: 490n },
    estimatedFeeSompi: 10n,
    estimatedMass: 100n
  };
  return createTxPlanArtifact({
    ctx,
    networkId: asNetworkId("simnet") as any,
    mode: "simulator",
    from: { input: "alice", address: "kaspasim:qqalice", accountName: "alice" },
    to: { input: "bob", address: "kaspasim:qqbob" },
    amountSompi: 500n,
    plan
  });
}

/** A plan exactly as the rc.22 producer wrote it: v4, two-pass root lineage, post-hash artifactId/planId labels. */
function makeV4Plan(): any {
  const legacy: any = structuredClone(makeV5Plan());
  legacy.hashVersion = 4;
  legacy.hardkasVersion = "0.12.0-rc.22";
  delete legacy.contentHash;
  delete legacy.planId;
  const firstPass = calculateContentHash(legacy, 4);
  legacy.lineage = { artifactId: "", lineageId: firstPass, parentArtifactId: "", rootArtifactId: firstPass, sequence: 1 };
  legacy.workflowId = `wf_${firstPass.slice(0, 16)}`;
  legacy.contentHash = calculateContentHash(legacy, 4);
  legacy.lineage.artifactId = legacy.contentHash;
  legacy.planId = `plan-${legacy.contentHash.slice(0, 16)}`;
  legacy.artifactId = legacy.contentHash; // excluded by name in v4; written after hashing by rc.22 producers
  return legacy;
}

/** A simulated receipt as rc.22 wrote it: v4, `status` and `sourceSignedId` outside the hash. */
function makeV4Receipt(parent: any): any {
  const r: any = {
    schema: "hardkas.txReceipt",
    schemaVersion: "hardkas.txReceipt.v1",
    hardkasVersion: "0.12.0-rc.22",
    version: "1.0.0-alpha",
    hashVersion: 4,
    createdAt: "2026-09-01T00:00:00.000Z",
    txId: "simtx_" + "1".repeat(32),
    status: "accepted",
    mode: "simulator",
    networkId: "simnet",
    from: { address: "kaspasim:qqalice" },
    to: { address: "kaspasim:qqbob" },
    amountSompi: "500",
    feeSompi: "10",
    execution: { mode: "simulator", domain: "kaspa-l1", network: "simnet" },
    sourceSignedId: "signed-0000000000000000",
    lineage: { artifactId: "", lineageId: parent.lineage.lineageId, parentArtifactId: parent.contentHash, rootArtifactId: parent.lineage.rootArtifactId, sequence: 2 }
  };
  r.contentHash = calculateContentHash(r, 4);
  r.lineage.artifactId = r.contentHash;
  return r;
}

describe("Wave 1.3 · D-Q1.f migrate --to 5 without whitewash", () => {
  it("the migration entry point exists and is explicit about the target hash version", () => {
    expect(typeof api.migrateArtifactToHashVersion).toBe("function");
  });

  it("a v4 plan migrates to a NEW v5 artifact that verifies strict FULL; the source object is untouched", () => {
    const source = makeV4Plan();
    const frozenSource = JSON.stringify(source);
    const out = api.migrateArtifactToHashVersion(source, { to: 5, migrationId: "mig-w13-plan" });
    expect(JSON.stringify(source)).toBe(frozenSource);

    const migrated = out.artifact;
    expect(migrated).not.toBe(source);
    expect(migrated.hashVersion).toBe(CURRENT_HASH_VERSION);
    expect(migrated.contentHash).not.toBe(source.contentHash);
    const r = verifyArtifactIntegritySync(structuredClone(migrated), { strict: true });
    expect(r.ok, codes(r).join(",")).toBe(true);
    expect(r.authScope).toBe("FULL");
  });

  it("unauthenticated material fields of the source do not enter the v5 body: they are recorded as legacy claims", () => {
    const source = makeV4Plan();
    const out = api.migrateArtifactToHashVersion(source, { to: 5, migrationId: "mig-w13-claims" });
    const migrated = out.artifact;
    // v4 never authenticated the top-level artifactId (and v5 forbids it, IC-7.3).
    expect(migrated.artifactId).toBeUndefined();
    expect(out.legacyClaims).toBeDefined();
    expect(migrated.legacyClaims).toEqual(out.legacyClaims);
    expect(migrated.legacyClaims.sourceHashVersion).toBe(4);
    expect(migrated.legacyClaims.sourceArtifactId).toBe(source.contentHash);
    expect(migrated.legacyClaims.verified).toBe(false);
    expect(Object.keys(migrated.legacyClaims.fields)).toContain("artifactId");
    expect(migrated.legacyClaims.fields.artifactId).toBe(source.contentHash);
    // Derived labels are recomputed from the NEW identity, never carried over.
    expect(migrated.planId).toBe(`plan-${migrated.contentHash.slice(0, 16)}`);
    expect(migrated.planId).not.toBe(source.planId);
  });

  it("the migrated artifact is a child of the verified source (lineage rebuilt from the recomputed source identity)", () => {
    const source = makeV4Plan();
    const out = api.migrateArtifactToHashVersion(source, { to: 5, migrationId: "mig-w13-lineage" });
    const migrated = out.artifact;
    expect(migrated.lineage.parentArtifactId).toBe(source.contentHash);
    expect(migrated.lineage.artifactId).toBe(migrated.contentHash);
    expect(migrated.lineage.lineageId).toMatch(/^[0-9a-f]{64}$/);
    expect(migrated.lineage.rootArtifactId).toMatch(/^[0-9a-f]{64}$/);
    expect(migrated.lineage.sequence).toBe(source.lineage.sequence + 1);
    expect(verifyLineage(migrated, source, { strict: true }).ok).toBe(true);
  });

  it("N13: the MigrationReceipt carries a valid hexadecimal lineage, verifies strict FULL and references recomputed hashes", () => {
    const source = makeV4Plan();
    const out = api.migrateArtifactToHashVersion(source, { to: 5, migrationId: "mig-w13-receipt" });
    const receipt = out.receipt;
    expect(receipt.schema).toBe("hardkas.migrationReceipt.v1");
    expect(receipt.hashVersion).toBe(CURRENT_HASH_VERSION);
    expect(receipt.oldHash).toBe(source.contentHash);
    expect(receipt.newHash).toBe(out.artifact.contentHash);
    expect(receipt.lineage.lineageId).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.lineage.rootArtifactId).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.lineage.parentArtifactId).toBe(source.contentHash);
    expect(receipt.lineage.artifactId).toBe(receipt.contentHash);
    expect(receipt.artifactId).toBeUndefined();
    const r = verifyArtifactIntegritySync(structuredClone(receipt), { strict: true });
    expect(r.ok, codes(r).join(",")).toBe(true);
    expect(r.authScope).toBe("FULL");
    expect(verifyLineage(receipt, source, { strict: true }).ok).toBe(true);
  });

  it("a source whose claimed contentHash does not match its content is refused (nothing is re-issued from tampered material)", () => {
    const source = makeV4Plan();
    source.amountSompi = "1";
    expect(() => api.migrateArtifactToHashVersion(source, { to: 5, migrationId: "x" })).toThrow(/MIGRATION_SOURCE_INVALID/);
  });

  it("a source without a valid hashVersion is refused (IC-4′.2: it cannot be verified, so it cannot be migrated)", () => {
    const source = makeV4Plan();
    delete source.hashVersion;
    expect(() => api.migrateArtifactToHashVersion(source, { to: 5, migrationId: "x" })).toThrow(/HASH_VERSION_INVALID/);
  });

  it("an artifact already at version 5 is not migrated (MIGRATION_NOT_NEEDED); only --to 5 is supported", () => {
    const current = makeV5Plan();
    expect(() => api.migrateArtifactToHashVersion(current, { to: 5, migrationId: "x" })).toThrow(/MIGRATION_NOT_NEEDED/);
    expect(() => api.migrateArtifactToHashVersion(makeV4Plan(), { to: 4, migrationId: "x" })).toThrow(/MIGRATION_TARGET_UNSUPPORTED/);
  });

  it("a legacy receipt whose REQUIRED field `status` was never authenticated cannot be re-issued as v5 (refused, not whitewashed)", () => {
    const plan = makeV4Plan();
    const receipt = makeV4Receipt(plan);
    // Sanity: the v4 receipt verifies in LEGACY scope and names `status` as unauthenticated.
    const legacy = verifyArtifactIntegritySync(structuredClone(receipt), { strict: false });
    expect(legacy.ok, codes(legacy).join(",")).toBe(true);
    expect(legacy.unauthenticatedMaterialFields).toContain("status");
    let error: any;
    try {
      api.migrateArtifactToHashVersion(receipt, { to: 5, migrationId: "mig-w13-receipt-status" });
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe("MIGRATION_UNVERIFIED_REQUIRED_FIELDS");
    expect(error?.fields).toContain("status");
  });

  it("the legacy schema-version migration (0.1.0 → 1.0.0-alpha) seals through the same rule: no unauthenticated field enters the body", () => {
    const v1: any = {
      schema: "hardkas.txPlan.v1",
      version: "0.1.0",
      hardkasVersion: "0.5.0",
      hashVersion: 3,
      networkId: "simnet",
      mode: "simulator",
      createdAt: "2026-01-01T00:00:00.000Z",
      from: { address: "kaspasim:qqalice" },
      to: { address: "kaspasim:qqbob" },
      amountSompi: "100",
      estimatedFeeSompi: "1",
      estimatedMass: "1",
      inputs: [],
      outputs: [],
      lineage: { artifactId: "", lineageId: "1".repeat(64), rootArtifactId: "1".repeat(64), sequence: 1 }
    };
    v1.contentHash = calculateContentHash(v1, 3); // v3 dropped `lineage` by name: never authenticated
    v1.lineage.artifactId = v1.contentHash;
    const result = api.migrateArtifactPayload(v1, "1.0.0-alpha");
    expect(result.migrated).toBe(true);
    const migrated = result.artifact;
    expect(migrated.hashVersion).toBe(CURRENT_HASH_VERSION);
    // The claimed legacy lineage is a legacy claim; the new lineage hangs from the verified source.
    expect(migrated.legacyClaims?.fields?.lineage).toEqual({ artifactId: v1.contentHash, lineageId: "1".repeat(64), rootArtifactId: "1".repeat(64), sequence: 1 });
    expect(migrated.lineage.parentArtifactId).toBe(v1.contentHash);
    expect(migrated.lineage.lineageId).toMatch(/^[0-9a-f]{64}$/);
    expect(migrated.lineage.rootArtifactId).toMatch(/^[0-9a-f]{64}$/);
    expect(migrated.originalContentHash).toBeUndefined();
    const r = verifyArtifactIntegritySync(structuredClone(migrated), { strict: true });
    expect(r.ok, codes(r).join(",")).toBe(true);
  });

  it("the migration receipt generator recomputes the hashes it certifies instead of trusting claims", () => {
    const source = makeV4Plan();
    const tampered = { ...source, amountSompi: "1" };
    expect(() => api.generateMigrationReceipt(tampered, makeV5Plan(), "x")).toThrow(/MIGRATION_SOURCE_INVALID/);
  });
});
