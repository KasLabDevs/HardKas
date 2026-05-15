import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { HardkasIndexer } from "../src/indexer.js";
import { HardkasStore } from "../src/db.js";

describe("HardkasIndexer Corruption Diagnostics", () => {
  let tempDir: string;
  let db: DatabaseSync;
  let hardkasDir: string;
  let store: HardkasStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-corruption-test-"));
    hardkasDir = path.join(tempDir, ".hardkas");
    fs.mkdirSync(hardkasDir);
    
    const dbPath = path.join(tempDir, "test.db");
    store = new HardkasStore({ dbPath });
    store.connect();
    db = store.getDatabase();
  });

  afterEach(() => {
    if (store) store.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should detect and report invalid JSON artifact", async () => {
    const filePath = path.join(hardkasDir, "bad.json");
    fs.writeFileSync(filePath, "{ invalid json }");

    const indexer = new HardkasIndexer(db, { cwd: tempDir });
    const result = await indexer.sync();

    expect(result.artifacts.corrupted).toBe(1);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "ARTIFACT_JSON_INVALID",
      severity: "error"
    }));
  });

  it("should detect and report artifact hash mismatch", async () => {
    const filePath = path.join(hardkasDir, "mismatch.json");
    const artifact = {
      schema: "hardkas.txPlan",
      version: "1.0.0-alpha",
      contentHash: "wrong-hash",
      payload: { data: 123 }
    };
    fs.writeFileSync(filePath, JSON.stringify(artifact));

    const indexer = new HardkasIndexer(db, { cwd: tempDir });
    const result = await indexer.sync();

    expect(result.artifacts.corrupted).toBe(1);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "ARTIFACT_HASH_MISMATCH",
      severity: "error"
    }));
  });

  it("should detect and report line-specific event corruption", async () => {
    const eventsPath = path.join(hardkasDir, "events.jsonl");
    const validEvent = JSON.stringify({
      schema: "hardkas.event",
      version: "1.0.0",
      eventId: "evt-1",
      domain: "workflow",
      kind: "workflow.started",
      timestamp: new Date().toISOString(),
      workflowId: "wf-1",
      correlationId: "corr-1",
      networkId: "simnet",
      payload: {}
    });
    
    const invalidLine = "{ not json }";
    const invalidEnvelope = JSON.stringify({ schema: "hardkas.event", eventId: "missing-fields" });

    fs.writeFileSync(eventsPath, `${validEvent}\n${invalidLine}\n${invalidEnvelope}\n`);

    const indexer = new HardkasIndexer(db, { cwd: tempDir });
    const result = await indexer.sync();

    expect(result.events.indexed).toBe(1);
    expect(result.events.corrupted).toBe(2);
    
    // Check line 2 (JSON invalid)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "EVENT_JSON_INVALID",
      lineNumber: 2
    }));

    // Check line 3 (Schema invalid)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "EVENT_SCHEMA_INVALID",
      lineNumber: 3
    }));
  });

  it("should fail-fast in strict mode when corruption is found", async () => {
    const filePath = path.join(hardkasDir, "bad.json");
    fs.writeFileSync(filePath, "{ invalid json }");

    const indexer = new HardkasIndexer(db, { cwd: tempDir, strict: true });
    
    await expect(indexer.sync()).rejects.toThrow();
  });

  it("should detect pending migrations via checkHealth", () => {
    // We already have 1 migration applied (initial_schema)
    // We can't easily add a new migration just for this test without modifying the registry.
    // But we can manually remove the history to trigger 'required'
    
    db.exec("DELETE FROM hardkas_migrations");
    
    const health = store.checkHealth();
    expect(health.ok).toBe(false);
    expect(health.issues).toContainEqual(expect.objectContaining({
      code: "STORE_MIGRATION_REQUIRED"
    }));
  });
});
