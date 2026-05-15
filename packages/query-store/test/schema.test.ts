import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
import { HardkasStore } from "../src/db.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SCHEMA_VERSION } from "../src/schema.js";

describe("Query Store Schema Integrity", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-schema-test-"));
    dbPath = path.join(tmpDir, "store.db");
    store = new HardkasStore({ dbPath });
  });

  let store: HardkasStore;

  afterEach(async () => {
    if (store) store.disconnect();
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create all required tables and migration history", () => {
    store.connect({ autoMigrate: true });
    const db = store.getDatabase();

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain("artifacts");
    expect(tableNames).toContain("lineage_edges");
    expect(tableNames).toContain("events");
    expect(tableNames).toContain("traces");
    expect(tableNames).toContain("metadata");
    expect(tableNames).toContain("hardkas_migrations");

    const migrations = db.prepare("SELECT * FROM hardkas_migrations").all();
    expect(migrations).toHaveLength(1);

    store.disconnect();
  });

  it("should create expected indexes", () => {
    store.connect({ autoMigrate: true });
    const db = store.getDatabase();

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[];
    const indexNames = indexes.map(i => i.name);

    expect(indexNames).toContain("idx_artifacts_content_hash");
    expect(indexNames).toContain("idx_events_workflow_id");
    expect(indexNames).toContain("idx_traces_status");

    store.disconnect();
  });
});
