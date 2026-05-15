import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { HardkasIndexer } from "../src/indexer.js";
import { HardkasStore } from "../src/db.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { calculateContentHash } from "@hardkas/artifacts";

describe("Query Store Rebuild Equivalence", () => {
  let tempDir: string;
  let hkDir: string;
  let store: HardkasStore;
  let db: DatabaseSync;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-rebuild-eq-"));
    hkDir = path.join(tempDir, ".hardkas");
    fs.mkdirSync(hkDir);
    const dbPath = path.join(hkDir, "store.db");
    
    store = new HardkasStore({ dbPath });
    store.connect({ autoMigrate: true });
    db = store.getDatabase();
  });

  afterEach(() => {
    store.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createMockArtifact = (id: string, schema: string = "hardkas.txReceipt") => {
    const artifact: any = {
      schema,
      version: "1.0.0-alpha",
      hardkasVersion: "0.2.0",
      networkId: "simnet",
      mode: "real",
      artifactId: id,
      createdAt: new Date().toISOString(),
      // Fields for txReceipt to satisfy Zod
      txId: `tx-${id}`,
      status: "accepted",
      from: { address: "kaspa:123" },
      to: { address: "kaspa:456" },
      amountSompi: "1000",
      feeSompi: "100",
      payload: {}
    };
    
    // In HardKAS, contentHash is calculated from the object excluding the contentHash field itself (or with it as empty)
    artifact.contentHash = calculateContentHash(artifact);
    return JSON.stringify(artifact);
  };

  const getIndexSnapshot = (db: DatabaseSync) => {
    const artifacts = db.prepare("SELECT artifact_id, content_hash, schema FROM artifacts ORDER BY artifact_id").all();
    const edges = db.prepare("SELECT parent_artifact_id, child_artifact_id FROM lineage_edges ORDER BY parent_artifact_id").all();
    const snapshot = JSON.stringify({ artifacts, edges });
    return createHash("sha256").update(snapshot).digest("hex");
  };

  it("should be idempotent: sync twice produces same index state", async () => {
    const artPath = path.join(hkDir, "art1.json");
    fs.writeFileSync(artPath, createMockArtifact("art1"));

    const indexer = new HardkasIndexer(db, { cwd: tempDir });
    
    await indexer.sync();
    const hash1 = getIndexSnapshot(db);
    
    await indexer.sync();
    const hash2 = getIndexSnapshot(db);
    
    expect(hash1).toBe(hash2);
  });

  it("should be equivalent: rebuild after wipe matches original sync", async () => {
    // Generate 5 artifacts
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(path.join(hkDir, `art${i}.json`), createMockArtifact(`art${i}`));
    }

    const indexer = new HardkasIndexer(db, { cwd: tempDir });
    
    await indexer.sync();
    const hashOriginal = getIndexSnapshot(db);
    
    // Wipe and Rebuild
    await indexer.rebuild();
    const hashRebuilt = getIndexSnapshot(db);
    
    expect(hashOriginal).toBe(hashRebuilt);
  });

  it("should detect additions and deletions during sync", async () => {
    const indexer = new HardkasIndexer(db, { cwd: tempDir });
    
    // 1. Initial
    fs.writeFileSync(path.join(hkDir, "a.json"), createMockArtifact("a"));
    await indexer.sync();
    expect(indexer.doctor().zombieArtifacts).toBe(0);
    
    // 2. Add
    fs.writeFileSync(path.join(hkDir, "b.json"), createMockArtifact("b"));
    await indexer.sync();
    const countAfterAdd = db.prepare("SELECT COUNT(*) as c FROM artifacts").get() as { c: number };
    expect(countAfterAdd.c).toBe(2);
 
    // 3. Delete
    fs.unlinkSync(path.join(hkDir, "a.json"));
    await indexer.sync(); // Cleanup should happen here
    const countAfterDel = db.prepare("SELECT COUNT(*) as c FROM artifacts").get() as { c: number };
    expect(countAfterDel.c).toBe(1);
    expect(indexer.doctor().zombieArtifacts).toBe(0);
  });

  it("should support sequential migrate, rebuild, and doctor without transaction errors", async () => {
    const indexer = new HardkasIndexer(db, { cwd: tempDir });
    
    // 1. Initial migrate (handled by connect already, but we can call again)
    const migrationResult = store.migrate();
    expect(migrationResult.status).toBe("ok");

    // 2. Add data
    fs.writeFileSync(path.join(hkDir, "seq1.json"), createMockArtifact("seq1"));
    await indexer.sync();
    
    // 3. Rebuild
    const rebuildResult = await indexer.rebuild();
    expect(rebuildResult.ok).toBe(true);
    expect(rebuildResult.artifacts.indexed).toBe(1);

    // 4. Doctor
    const report = indexer.doctor();
    expect(report.ok).toBe(true);
    expect(report.staleArtifacts).toBe(0);
  });
});
