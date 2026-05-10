import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { HardkasStore } from "../src/db.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Query Store Schema (Phase 3)", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-schema-test-"));
    dbPath = path.join(tmpDir, "store.db");
  });

  afterEach(async () => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create all required tables in V2", () => {
    const store = new HardkasStore({ dbPath });
    store.connect();
    const db = store.getDatabase();

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    assert.ok(tableNames.includes("artifacts"));
    assert.ok(tableNames.includes("lineage_edges"));
    assert.ok(tableNames.includes("events"));
    assert.ok(tableNames.includes("traces"));
    assert.ok(tableNames.includes("metadata"));

    store.disconnect();
  });

  it("should create expected indexes", () => {
    const store = new HardkasStore({ dbPath });
    store.connect();
    const db = store.getDatabase();

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[];
    const indexNames = indexes.map(i => i.name);

    assert.ok(indexNames.includes("idx_artifacts_content_hash"));
    assert.ok(indexNames.includes("idx_events_workflow_id"));
    assert.ok(indexNames.includes("idx_traces_status"));

    store.disconnect();
  });

  it("should handle migration/recreation from V1 safely", () => {
    // 1. Create a V1-like database manually
    const storeV1 = new HardkasStore({ dbPath });
    storeV1.connect();
    const db = storeV1.getDatabase();
    
    // Force version 1 in metadata
    db.exec("UPDATE metadata SET value = '1' WHERE key = 'version'");
    storeV1.disconnect();

    // 2. Connect with V2 code
    const storeV2 = new HardkasStore({ dbPath });
    storeV2.connect(); // Should trigger migration logic (drop and recreate)
    
    const version = storeV2.getDatabase().prepare("SELECT value FROM metadata WHERE key = 'version'").get() as { value: string };
    assert.strictEqual(version.value, "2");
    
    storeV2.disconnect();
  });
});
