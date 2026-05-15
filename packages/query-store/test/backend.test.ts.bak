import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { HardkasStore } from "../src/db.js";
import { SqliteQueryBackend } from "../src/backend.ts";

describe("SqliteQueryBackend", () => {
  let store: HardkasStore;
  let backend: SqliteQueryBackend;

  beforeEach(() => {
    store = new HardkasStore({ memory: true });
    store.connect();
    backend = new SqliteQueryBackend(store);
    
    // Seed some data
    const db = store.getDatabase();
    db.exec(`
      INSERT INTO artifacts (artifact_id, content_hash, schema, version, kind, network_id, raw_json)
      VALUES ('art-1', 'hash-1', 'hardkas.test', '1.0', 'txPlan', 'testnet-10', '{}');
      
      INSERT INTO events (event_id, kind, domain, workflow_id, correlation_id, network_id, raw_json)
      VALUES ('evt-1', 'workflow.started', 'workflow', 'wf-1', 'corr-1', 'testnet-10', '{"payload":{}}');
    `);
  });

  afterEach(() => {
    store.disconnect();
  });

  it("should find artifacts with filters", async () => {
    const results = await backend.findArtifacts({ schema: "hardkas.test" });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].artifactId, "art-1");
  });

  it("should get a specific artifact by artifactId or hash", async () => {
    const art1 = await backend.getArtifact("art-1");
    assert.ok(art1);
    assert.strictEqual(art1?.contentHash, "hash-1");

    const art2 = await backend.getArtifact("hash-1");
    assert.ok(art2);
    assert.strictEqual(art2?.artifactId, "art-1");
  });

  it("should get events with filters", async () => {
    const results = await backend.getEvents({ kind: "workflow.started" });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].workflowId, "wf-1");
  });
});
