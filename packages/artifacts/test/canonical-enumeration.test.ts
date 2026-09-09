import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ProjectArtifactStore } from "../src/store.js";

describe("QF-008: ProjectArtifactStore Canonical Enumeration & Path Containment Hardening", () => {
  let tmpDir: string;
  let store: ProjectArtifactStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-qf008-test-"));
    store = new ProjectArtifactStore(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("1. Enumerates artifacts across canonical subdirectories (plans, signed, receipts, lineage, misc)", async () => {
    const plan = { schema: "hardkas.txPlan.v1", planId: "plan-001", contentHash: "hash-plan-001", networkId: "simnet" };
    const signed = { schema: "hardkas.signedTx.v1", signedId: "signed-002", contentHash: "hash-signed-002", txId: "tx-002" };
    const receipt = { schema: "hardkas.txReceipt.v1", txId: "tx-003", contentHash: "hash-receipt-003", blockDaaScore: "100" };
    const lineage = { schema: "hardkas.lineage.v1", lineageId: "lineage-004", contentHash: "hash-lineage-004" };
    const misc = { schema: "hardkas.misc.v1", artifactId: "misc-005", contentHash: "hash-misc-005" };

    const pathPlan = await store.writeArtifact(plan);
    const pathSigned = await store.writeArtifact(signed);
    const pathReceipt = await store.writeArtifact(receipt);
    const pathLineage = await store.writeArtifact(lineage);
    const pathMisc = await store.writeArtifact(misc);

    expect(pathPlan).toContain("plans");
    expect(pathSigned).toContain("signed");
    expect(pathReceipt).toContain("receipts");
    expect(pathLineage).toContain("lineage");
    expect(pathMisc).toContain("misc");

    const entries = await store.enumerateCanonicalArtifacts();
    expect(entries.length).toBe(5);

    const schemas = entries.map(e => e.schema);
    expect(schemas).toContain("hardkas.txPlan.v1");
    expect(schemas).toContain("hardkas.signedTx.v1");
    expect(schemas).toContain("hardkas.txReceipt.v1");
    expect(schemas).toContain("hardkas.lineage.v1");
    expect(schemas).toContain("hardkas.misc.v1");

    // Deterministic relativeSubpath ordering
    const relativePaths = entries.map(e => e.relativeSubpath);
    const sortedRelativePaths = [...relativePaths].sort((a, b) => a.localeCompare(b));
    expect(relativePaths).toEqual(sortedRelativePaths);
  });

  it("2. Adversarial: Rejects sibling directory prefix escape (artifacts-evil) while allowing legitimate files starting with dot-dot", async () => {
    // Create sibling directory with matching textual prefix `.hardkas/artifacts-evil`
    const evilDir = path.join(tmpDir, ".hardkas", "artifacts-evil");
    await fs.mkdir(evilDir, { recursive: true });
    const evilFile = path.join(evilDir, "secret.json");
    await fs.writeFile(evilFile, JSON.stringify({ schema: "hardkas.evil", contentHash: "hash-evil-secret" }), "utf-8");

    // Create a legitimate file inside plans starting with dot-dot `plans/..metadata.json`
    const plansDir = path.join(tmpDir, ".hardkas", "artifacts", "plans");
    await fs.mkdir(plansDir, { recursive: true });
    await fs.writeFile(path.join(plansDir, "..metadata.json"), JSON.stringify({ schema: "hardkas.metadata", contentHash: "hash-dotdot-legit" }), "utf-8");

    const entries = await store.enumerateCanonicalArtifacts();
    const hashes = entries.map(e => e.contentHash);

    // EVIL file outside store must be rejected
    expect(hashes).not.toContain("hash-evil-secret");

    // LEGIT file inside store starting with dot-dot must be enumerated
    expect(hashes).toContain("hash-dotdot-legit");
  });

  it("3. Adversarial: Rejects symlinks pointing outside workspace store", async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-outside-store-"));
    const outsideFile = path.join(outsideDir, "malicious.json");
    await fs.writeFile(outsideFile, JSON.stringify({ schema: "hardkas.malicious", contentHash: "hash-bad" }), "utf-8");

    const miscDir = path.join(tmpDir, ".hardkas", "artifacts", "misc");
    await fs.mkdir(miscDir, { recursive: true });
    const symlinkPath = path.join(miscDir, "symlink-bad.json");
    
    try {
      await fs.symlink(outsideFile, symlinkPath, "file");
    } catch (e) {
      // Symlink permission on Windows fallback
    }

    const entries = await store.enumerateCanonicalArtifacts();
    const hashes = entries.map(e => e.contentHash);
    expect(hashes).not.toContain("hash-bad");

    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  it("4. Deduplicates physical real paths cleanly while preserving distinct physical files with same hash", async () => {
    const planA = { schema: "hardkas.txPlan.v1", planId: "plan-a", contentHash: "shared-hash-123" };
    const planB = { schema: "hardkas.txPlan.v1", planId: "plan-b", contentHash: "shared-hash-123" };

    await store.writeArtifact(planA);

    const plansDir = path.join(tmpDir, ".hardkas", "artifacts", "plans");
    await fs.writeFile(path.join(plansDir, "manual-plan-b.json"), JSON.stringify(planB), "utf-8");

    const realPlanAPath = (await fs.readdir(plansDir)).find(f => f.includes("plan-hash"));
    if (realPlanAPath) {
      try {
        await fs.symlink(path.join(plansDir, realPlanAPath), path.join(plansDir, "symlink-plan-a.json"), "file");
      } catch (e) {}
    }

    const entries = await store.enumerateCanonicalArtifacts();

    const planAEntries = entries.filter(e => e.artifact.planId === "plan-a");
    expect(planAEntries.length).toBe(1);

    expect(entries.length).toBe(2);
  });
});
