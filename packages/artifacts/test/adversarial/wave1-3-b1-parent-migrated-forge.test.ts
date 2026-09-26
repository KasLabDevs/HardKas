import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { systemRuntimeContext, asNetworkId } from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION } from "../../src/canonical.js";
import { verifyArtifactIntegritySync, verifyArtifactSemantics } from "../../src/verify.js";
import { ProjectArtifactStore } from "../../src/store.js";
import { createTxPlanArtifact } from "../../src/tx-plan.js";
import * as migration from "../../src/migration.js";

// WAVE_1_3_SECURITY_REVIEW · B1 (PARENT_MIGRATED forge)
//
// IC-5′.6: a persisted reference resolves only by artifactId, WITH verification of
// the target. A MigrationReceipt can never turn a reference that resolves to
// nothing into a valid one. The only migration tolerance lives on the SOURCE side
// (SUPERSEDED_BY_MIGRATION, informative, store verification only) and requires a
// FULL receipt, an existing strictly-verifying re-issue and a real lineage link.

const api = migration as any;
const ctx = { ...systemRuntimeContext, clock: { now: () => 1_700_000_000_000 } };
const codes = (r: { issues: Array<{ code: string; severity: string }> }) => r.issues.map((i) => `${i.severity}:${i.code}`);
const GHOST = "e".repeat(64); // an artifactId that never existed anywhere

function sealV5(body: Record<string, unknown>, label?: "signedId" | "planId"): any {
  const a: any = { ...body, hashVersion: CURRENT_HASH_VERSION };
  a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
  if (a.lineage) a.lineage.artifactId = a.contentHash;
  if (label === "signedId") a.signedId = `signed-${a.contentHash.slice(0, 16)}`;
  if (label === "planId") a.planId = `plan-${a.contentHash.slice(0, 16)}`;
  return a;
}

/** The exact forgery reproduced by the review: a v5 signed hanging from a ghost parent. */
function forgedSigned(): any {
  return sealV5(
    {
      schema: "hardkas.signedTx",
      hardkasVersion: "0.12.0-rc.23",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulator",
      createdAt: "2026-09-25T00:00:00.000Z",
      execution: { mode: "simulator", domain: "kaspa-l1", network: "simnet" },
      status: "signed",
      sourcePlanId: "plan-0000000000000000",
      from: { address: "kaspasim:qqalice" },
      to: { address: "kaspasim:qqbob" },
      amountSompi: "1",
      workflowId: "wf_0000000000000000",
      assumptionLevel: "local-simulated",
      signedTransaction: { format: "simulated", payload: "x" },
      lineage: { artifactId: "", parentArtifactId: GHOST, lineageId: GHOST, rootArtifactId: GHOST, sequence: 2 }
    },
    "signedId"
  );
}

/** A self-consistent (FULL) MigrationReceipt "certifying" oldHash → newHash. */
function forgedReceipt(oldHash: string, newHash: string, fromSchema = "hardkas.signedTx"): any {
  return sealV5({
    schema: "hardkas.migrationReceipt.v1",
    hardkasVersion: "0.12.0-rc.23",
    version: "1.0.0-alpha",
    networkId: "simnet",
    mode: "simulator",
    createdAt: "2026-09-25T00:00:00.000Z",
    oldHash,
    newHash,
    fromSchema,
    toSchema: fromSchema,
    migrationId: "forged",
    decision: "MIGRATED_WITH_PROOF",
    lineage: { artifactId: "", parentArtifactId: oldHash, lineageId: oldHash, rootArtifactId: oldHash, sequence: 1 }
  });
}

/** A plan exactly as the rc.22 producer wrote it: v4, two-pass root lineage, post-hash labels. */
function legacyV4Plan(): any {
  // Economically valid (strict semantics audits mass and fee): mass and fee are the
  // values the economic verifier recomputes for this shape.
  const plan: any = {
    inputs: [{ outpoint: { transactionId: "ab".repeat(32), index: 0 }, amountSompi: 1_000_000_000n, address: "kaspasim:qqalice", scriptPublicKey: "spk" }],
    outputs: [{ address: "kaspasim:qqbob", amountSompi: 500_000_000n }],
    change: { address: "kaspasim:qqalice", amountSompi: 1_000_000_000n - 500_000_000n - 300_100n },
    estimatedFeeSompi: 300_100n,
    estimatedMass: 3_001n
  };
  const legacy: any = structuredClone(
    createTxPlanArtifact({
      ctx,
      networkId: asNetworkId("simnet") as any,
      mode: "simulator",
      from: { input: "alice", address: "kaspasim:qqalice", accountName: "alice" },
      to: { input: "bob", address: "kaspasim:qqbob" },
      amountSompi: 500_000_000n,
      plan
    })
  );
  legacy.hashVersion = 4;
  legacy.hardkasVersion = "0.12.0-rc.22";
  delete legacy.contentHash;
  delete legacy.planId;
  const firstPass = calculateContentHash(legacy, 4);
  legacy.lineage = { artifactId: "", lineageId: firstPass, parentArtifactId: "", rootArtifactId: firstPass, sequence: 1 };
  legacy.contentHash = calculateContentHash(legacy, 4);
  legacy.lineage.artifactId = legacy.contentHash;
  legacy.planId = `plan-${legacy.contentHash.slice(0, 16)}`;
  legacy.artifactId = legacy.contentHash;
  return legacy;
}

describe("B1 · a MigrationReceipt never turns a missing parent into a valid one", () => {
  let ws: string;
  let store: ProjectArtifactStore;
  const previousStaleness = process.env.HARDKAS_TEST_IGNORE_STALENESS;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-b1-forge-"));
    store = new ProjectArtifactStore(ws);
    process.env.HARDKAS_TEST_IGNORE_STALENESS = "1";
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
    if (previousStaleness === undefined) delete process.env.HARDKAS_TEST_IGNORE_STALENESS;
    else process.env.HARDKAS_TEST_IGNORE_STALENESS = previousStaleness;
  });

  it("the exact forgery: v5 signed + ghost parent + forged FULL receipt → strict PARENT_MISSING (error)", async () => {
    const signed = forgedSigned();
    const receipt = forgedReceipt(GHOST, signed.contentHash);
    await store.writeArtifact(signed);
    await store.writeArtifact(receipt);

    // Both forged artifacts are self-consistent: the attack is not a hash mismatch.
    for (const a of [signed, receipt]) {
      const integrity = verifyArtifactIntegritySync(structuredClone(a), { strict: true });
      expect(integrity.ok, codes(integrity).join(",")).toBe(true);
      expect(integrity.authScope).toBe("FULL");
    }

    const semantics = verifyArtifactSemantics(structuredClone(signed), { strict: true, workspaceRoot: ws });
    expect(semantics.ok).toBe(false);
    expect(codes(semantics)).toContain("error:PARENT_MISSING");
    expect(codes(semantics).some((c) => /PARENT_MIGRATED|MIGRATION_SOURCE_ABSENT/.test(c))).toBe(false);
  });

  it("the forged receipt itself hangs from the ghost: strict PARENT_MISSING, never MIGRATION_SOURCE_ABSENT", async () => {
    const signed = forgedSigned();
    const receipt = forgedReceipt(GHOST, signed.contentHash);
    await store.writeArtifact(signed);
    await store.writeArtifact(receipt);

    const semantics = verifyArtifactSemantics(structuredClone(receipt), { strict: true, workspaceRoot: ws });
    expect(semantics.ok).toBe(false);
    expect(codes(semantics)).toContain("error:PARENT_MISSING");
    expect(codes(semantics).some((c) => /PARENT_MIGRATED|MIGRATION_SOURCE_ABSENT/.test(c))).toBe(false);
  });

  it("positive: a genuine migration with the legacy source present verifies strict through the normal parent path", async () => {
    const legacy = legacyV4Plan();
    await store.writeArtifact(legacy);
    const out = api.migrateArtifactToHashVersion(legacy, { to: 5, migrationId: "mig-b1-genuine" });
    await store.writeArtifact(out.artifact);
    await store.writeArtifact(out.receipt);

    for (const a of [out.artifact, out.receipt]) {
      const semantics = verifyArtifactSemantics(structuredClone(a), { strict: true, workspaceRoot: ws });
      expect(semantics.ok, codes(semantics).join(",")).toBe(true);
      expect(codes(semantics).some((c) => /PARENT_MISSING|PARENT_MIGRATED|MIGRATION_SOURCE_ABSENT/.test(c))).toBe(false);
    }

    // Source-side tolerance: the legacy source is superseded, and only that.
    const superseded = api.findSupersedingMigration(ws, legacy);
    expect(superseded).toEqual({ receiptId: out.receipt.contentHash, newArtifactId: out.artifact.contentHash });
    // It confers no authority: strict integrity of the source is still MIGRATION_REQUIRED.
    const strictSource = verifyArtifactIntegritySync(structuredClone(legacy), { strict: true });
    expect(strictSource.ok).toBe(false);
    expect(codes(strictSource)).toContain("error:MIGRATION_REQUIRED");
  });

  it("the same genuine migration WITHOUT the source in the store fails strict with PARENT_MISSING (the source must stay)", async () => {
    const legacy = legacyV4Plan();
    const out = api.migrateArtifactToHashVersion(legacy, { to: 5, migrationId: "mig-b1-no-source" });
    await store.writeArtifact(out.artifact);
    await store.writeArtifact(out.receipt);
    const semantics = verifyArtifactSemantics(structuredClone(out.artifact), { strict: true, workspaceRoot: ws });
    expect(semantics.ok).toBe(false);
    expect(codes(semantics)).toContain("error:PARENT_MISSING");
  });

  it("SUPERSEDED_BY_MIGRATION requires every condition; each forged or broken variant yields nothing", async () => {
    const legacy = legacyV4Plan();
    await store.writeArtifact(legacy);
    const out = api.migrateArtifactToHashVersion(legacy, { to: 5, migrationId: "mig-b1-conditions" });

    // (a) receipt present, newHash artifact absent from the store
    await store.writeArtifact(out.receipt);
    expect(api.findSupersedingMigration(ws, legacy)).toBeUndefined();

    // (b) newHash artifact present but its lineage parent is NOT the legacy source
    const stranger = sealV5(
      {
        schema: "hardkas.policy.v1",
        hardkasVersion: "0.12.0-rc.23",
        version: "1.0.0-alpha",
        networkId: "simnet",
        mode: "simulator",
        createdAt: "2026-09-25T00:00:00.000Z",
        decision: "ALLOW",
        rules: []
      }
    );
    await store.writeArtifact(stranger);
    await store.writeArtifact(forgedReceipt(legacy.contentHash, stranger.contentHash, "hardkas.txPlan"));
    expect(api.findSupersedingMigration(ws, legacy)).toBeUndefined();

    // (c) a LEGACY (v4) receipt is not FULL
    const v4Receipt: any = { ...out.receipt, hashVersion: 4, migrationId: "v4-receipt" };
    delete v4Receipt.contentHash;
    v4Receipt.lineage = { ...v4Receipt.lineage, artifactId: "" };
    v4Receipt.contentHash = calculateContentHash(v4Receipt, 4);
    v4Receipt.lineage.artifactId = v4Receipt.contentHash;
    const ws2 = fs.mkdtempSync(path.join(os.tmpdir(), "hk-b1-v4r-"));
    try {
      const store2 = new ProjectArtifactStore(ws2);
      await store2.writeArtifact(legacy);
      await store2.writeArtifact(out.artifact);
      await store2.writeArtifact(v4Receipt);
      expect(api.findSupersedingMigration(ws2, legacy)).toBeUndefined();
    } finally {
      fs.rmSync(ws2, { recursive: true, force: true });
    }

    // (d) a newHash artifact that does not verify strict (v5 with a forbidden top-level artifactId)
    const ws3 = fs.mkdtempSync(path.join(os.tmpdir(), "hk-b1-bad-new-"));
    try {
      const store3 = new ProjectArtifactStore(ws3);
      await store3.writeArtifact(legacy);
      const badNew: any = { ...out.artifact, artifactId: out.artifact.contentHash };
      delete badNew.contentHash;
      delete badNew.planId;
      badNew.lineage = { ...badNew.lineage, artifactId: "" };
      badNew.contentHash = calculateContentHash(badNew, CURRENT_HASH_VERSION);
      badNew.lineage.artifactId = badNew.contentHash;
      badNew.planId = `plan-${badNew.contentHash.slice(0, 16)}`;
      fs.mkdirSync(path.join(ws3, ".hardkas", "artifacts", "plans"), { recursive: true });
      fs.writeFileSync(path.join(ws3, ".hardkas", "artifacts", "plans", "bad-new.json"), JSON.stringify(badNew));
      await store3.writeArtifact(forgedReceipt(legacy.contentHash, badNew.contentHash, "hardkas.txPlan"));
      expect(api.findSupersedingMigration(ws3, legacy)).toBeUndefined();
    } finally {
      fs.rmSync(ws3, { recursive: true, force: true });
    }

    // (e) a v5 artifact is never "superseded" (the tolerance is for legacy sources only)
    expect(api.findSupersedingMigration(ws, out.artifact)).toBeUndefined();

    // Control: completing the genuine set makes the legacy source superseded.
    await store.writeArtifact(out.artifact);
    expect(api.findSupersedingMigration(ws, legacy)).toEqual({ receiptId: out.receipt.contentHash, newArtifactId: out.artifact.contentHash });
  });
});

// WAVE_1_3_SECURITY_FIX_REVIEW §1.3 · "descendencia no implica re-emisión": a
// MigrationReceipt may mark a legacy source as superseded ONLY when the new
// artifact is a verifiable re-issue of the same semantic class (same base
// schema) AND the receipt describes exactly the observed schemas. A legitimate
// v5 CHILD of the legacy root (a signed tx) is never a re-issue, whatever a
// forged receipt claims.
describe("B1-bis · a descendant is not a re-issue: supersession requires schema continuity and a coherent receipt", () => {
  let ws: string;
  let store: ProjectArtifactStore;
  const previousStaleness = process.env.HARDKAS_TEST_IGNORE_STALENESS;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-b1bis-"));
    store = new ProjectArtifactStore(ws);
    process.env.HARDKAS_TEST_IGNORE_STALENESS = "1";
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
    if (previousStaleness === undefined) delete process.env.HARDKAS_TEST_IGNORE_STALENESS;
    else process.env.HARDKAS_TEST_IGNORE_STALENESS = previousStaleness;
  });

  /**
   * A legitimate v5 signed CHILD of a legacy plan (parentArtifactId = the plan). Since Wave 1.4
   * (IC-6′ / IC-4′.4) the producer refuses to authorize a legacy plan, so the child is sealed by
   * hand as an intact, non-synthetic (unbound) signed: exactly the kind of descendant an attacker
   * can still write into a store.
   */
  async function legacyRootWithChild() {
    const { createLineageTransition } = await import("../../src/lineage.js");
    const legacy = legacyV4Plan();
    const child: any = sealV5(
      {
        schema: "hardkas.signedTx",
        hardkasVersion: "0.12.0-rc.23",
        version: "1.0.0-alpha",
        networkId: legacy.networkId,
        mode: legacy.mode,
        createdAt: "2026-09-25T00:00:00.000Z",
        execution: legacy.execution,
        status: "signed",
        sourcePlanId: legacy.planId,
        from: { address: legacy.from.address },
        to: { address: legacy.to.address },
        amountSompi: legacy.amountSompi,
        ...(legacy.workflowId ? { workflowId: legacy.workflowId } : {}),
        ...(legacy.assumptionLevel ? { assumptionLevel: legacy.assumptionLevel } : {}),
        txId: "f".repeat(64),
        signedTransaction: { format: "hex", payload: "deadbeef" },
        lineage: createLineageTransition(legacy, "hardkas.signedTx")
      },
      "signedId"
    );
    await store.writeArtifact(legacy);
    await store.writeArtifact(child);
    expect(child.lineage.parentArtifactId).toBe(legacy.contentHash);
    // The child is a perfectly valid strict member of the store: the attack is not about its validity.
    const childSemantics = verifyArtifactSemantics(structuredClone(child), { strict: true, workspaceRoot: ws });
    expect(childSemantics.ok, codes(childSemantics).join(",")).toBe(true);
    return { legacy, child };
  }

  it("case 1 (attack) · legacy plan L → legitimate v5 signed child S + forged FULL receipt old=L,new=S → undefined; L stays MIGRATION_REQUIRED", async () => {
    const { legacy, child } = await legacyRootWithChild();
    const receipt = sealV5({
      schema: "hardkas.migrationReceipt.v1",
      hardkasVersion: "0.12.0-rc.23",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulator",
      createdAt: "2026-09-25T00:00:00.000Z",
      oldHash: legacy.contentHash,
      newHash: child.contentHash,
      fromSchema: "hardkas.txPlan",
      toSchema: "hardkas.signedTx", // honest about the schemas, dishonest about the relation
      migrationId: "forged-descendant",
      decision: "MIGRATED_WITH_PROOF",
      lineage: { artifactId: "", parentArtifactId: legacy.contentHash, lineageId: legacy.lineage.lineageId, rootArtifactId: legacy.lineage.rootArtifactId, sequence: 2 }
    });
    await store.writeArtifact(receipt);
    expect(verifyArtifactIntegritySync(structuredClone(receipt), { strict: true }).ok).toBe(true);

    expect(api.findSupersedingMigration(ws, legacy)).toBeUndefined();
    const strictSource = verifyArtifactIntegritySync(structuredClone(legacy), { strict: true });
    expect(strictSource.ok).toBe(false);
    expect(codes(strictSource)).toContain("error:MIGRATION_REQUIRED");
  });

  it("case 2 (genuine) · plan → re-issued plan keeps returning the pair and the re-issue is a strict member of the store", async () => {
    const legacy = legacyV4Plan();
    await store.writeArtifact(legacy);
    const out = api.migrateArtifactToHashVersion(legacy, { to: 5, migrationId: "mig-b1bis-genuine" });
    await store.writeArtifact(out.artifact);
    await store.writeArtifact(out.receipt);
    expect(out.artifact.schema).toBe(legacy.schema);
    expect(out.receipt.fromSchema).toBe(legacy.schema);
    expect(out.receipt.toSchema).toBe(out.artifact.schema);
    expect(api.findSupersedingMigration(ws, legacy)).toEqual({ receiptId: out.receipt.contentHash, newArtifactId: out.artifact.contentHash });
    const semantics = verifyArtifactSemantics(structuredClone(out.artifact), { strict: true, workspaceRoot: ws });
    expect(semantics.ok, codes(semantics).join(",")).toBe(true);
  });

  it("case 2b (genuine, schema-version step) · a 0.1.0 `.v1` plan re-issued as `hardkas.txPlan` is the same base schema and is superseded", async () => {
    const v1: any = {
      schema: "hardkas.txPlan.v1",
      version: "0.1.0",
      hashVersion: 4,
      hardkasVersion: "0.12.0-rc.22",
      networkId: "simnet",
      mode: "simulator",
      createdAt: "2026-09-01T00:00:00.000Z",
      from: { address: "kaspasim:qqalice" },
      to: { address: "kaspasim:qqbob" },
      amountSompi: "500000000",
      estimatedFeeSompi: "300100",
      estimatedMass: "3001",
      inputs: [{ outpoint: { transactionId: "ab".repeat(32), index: 0 }, amountSompi: "1000000000", address: "kaspasim:qqalice", scriptPublicKey: "spk" }],
      outputs: [{ address: "kaspasim:qqbob", amountSompi: "500000000" }],
      change: { address: "kaspasim:qqalice", amountSompi: String(1_000_000_000n - 500_000_000n - 300_100n) },
      workflowId: "wf_0000000000000000",
      assumptionLevel: "local-simulated",
      lineage: { artifactId: "", lineageId: "1".repeat(64), rootArtifactId: "1".repeat(64), sequence: 1 }
    };
    v1.contentHash = calculateContentHash(v1, 4);
    v1.lineage.artifactId = v1.contentHash;
    await store.writeArtifact(v1);
    const result = api.migrateArtifactPayload(v1, "1.0.0-alpha");
    const receipt = api.generateMigrationReceipt(v1, result.artifact, "mig-b1bis-v1");
    expect(result.artifact.schema).toBe("hardkas.txPlan");
    await store.writeArtifact(result.artifact);
    await store.writeArtifact(receipt);
    expect(api.findSupersedingMigration(ws, v1)).toEqual({ receiptId: receipt.contentHash, newArtifactId: result.artifact.contentHash });
  });

  it("case 3 (metadata forgery) · correct hashes but falsified fromSchema or toSchema → undefined", async () => {
    const legacy = legacyV4Plan();
    await store.writeArtifact(legacy);
    const out = api.migrateArtifactToHashVersion(legacy, { to: 5, migrationId: "mig-b1bis-meta" });
    await store.writeArtifact(out.artifact);

    const forgedMeta = (patch: Record<string, unknown>) => {
      const r: any = { ...out.receipt, ...patch, migrationId: `forged-${Object.keys(patch).join("-")}` };
      delete r.contentHash;
      r.lineage = { ...r.lineage, artifactId: "" };
      r.contentHash = calculateContentHash(r, CURRENT_HASH_VERSION);
      r.lineage.artifactId = r.contentHash;
      return r;
    };
    for (const patch of [{ fromSchema: "hardkas.signedTx" }, { toSchema: "hardkas.signedTx" }, { fromSchema: "hardkas.snapshot.v1", toSchema: "hardkas.snapshot.v1" }]) {
      const ws2 = fs.mkdtempSync(path.join(os.tmpdir(), "hk-b1bis-meta-"));
      try {
        const store2 = new ProjectArtifactStore(ws2);
        await store2.writeArtifact(legacy);
        await store2.writeArtifact(out.artifact);
        const receipt = forgedMeta(patch);
        await store2.writeArtifact(receipt);
        expect(verifyArtifactIntegritySync(structuredClone(receipt), { strict: true }).ok, JSON.stringify(patch)).toBe(true);
        expect(api.findSupersedingMigration(ws2, legacy), JSON.stringify(patch)).toBeUndefined();
      } finally {
        fs.rmSync(ws2, { recursive: true, force: true });
      }
    }
    // Control: the genuine receipt, same hashes, honest schemas → the pair.
    await store.writeArtifact(out.receipt);
    expect(api.findSupersedingMigration(ws, legacy)).toEqual({ receiptId: out.receipt.contentHash, newArtifactId: out.artifact.contentHash });
  });
});
