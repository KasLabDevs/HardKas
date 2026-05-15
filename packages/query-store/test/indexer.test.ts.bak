import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { HardkasStore, HardkasIndexer } from "../src/index.js";
import { calculateContentHash } from "@hardkas/artifacts";
import { createEventEnvelope, asWorkflowId, asCorrelationId, asNetworkId } from "@hardkas/core";

describe("HardkasIndexer (V2 Schema Compatibility)", () => {
  let tmpDir: string;
  let hardkasDir: string;
  let store: HardkasStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-indexer-test-"));
    hardkasDir = path.join(tmpDir, ".hardkas");
    await fs.mkdir(hardkasDir, { recursive: true });

    // In-memory SQLite store
    store = new HardkasStore({ memory: true });
    store.connect();
  });

  afterEach(async () => {
    store.disconnect();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should index empty .hardkas directory gracefully", () => {
    const indexer = new HardkasIndexer(store.getDatabase(), { cwd: tmpDir });
    assert.doesNotThrow(() => indexer.sync());

    const db = store.getDatabase();
    const count = (db.prepare("SELECT COUNT(*) as count FROM artifacts").get() as any).count;
    assert.strictEqual(count, 0);
  });

  it("should index valid artifacts", async () => {
    const artifact = {
      artifactId: "art-1",
      schema: "hardkas.test",
      version: "1.0.0-alpha",
      mode: "simulated",
      networkId: "simnet",
      createdAt: new Date().toISOString(),
      payload: "hello world"
    };
    (artifact as any).contentHash = calculateContentHash(artifact);

    await fs.writeFile(
      path.join(hardkasDir, "test-artifact.json"),
      JSON.stringify(artifact)
    );

    const indexer = new HardkasIndexer(store.getDatabase(), { cwd: tmpDir });
    indexer.sync();

    const db = store.getDatabase();
    const count = (db.prepare("SELECT COUNT(*) as count FROM artifacts").get() as any).count;
    assert.strictEqual(count, 1);

    const row = db.prepare("SELECT artifact_id, schema FROM artifacts").get() as any;
    assert.strictEqual(row.artifact_id, "art-1");
    assert.strictEqual(row.schema, "hardkas.test");
  });

  it("should index formal event envelopes", async () => {
    const event = createEventEnvelope({
      kind: "workflow.plan.created",
      domain: "workflow",
      workflowId: asWorkflowId("wf-1"),
      correlationId: asCorrelationId("corr-1"),
      networkId: asNetworkId("testnet-10"),
      payload: { planId: "art-1" as any, network: asNetworkId("testnet-10"), amountSompi: 1000n }
    });

    await fs.writeFile(
      path.join(hardkasDir, "events.jsonl"),
      JSON.stringify(event, (_, v) => typeof v === 'bigint' ? v.toString() : v) + "\n"
    );

    const indexer = new HardkasIndexer(store.getDatabase(), { cwd: tmpDir });
    indexer.sync();

    const db = store.getDatabase();
    const rows = db.prepare("SELECT kind, workflow_id FROM events").all() as any[];
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].kind, "workflow.plan.created");
    assert.strictEqual(rows[0].workflow_id, "wf-1");
  });

  it("should index lineage edges", async () => {
    const parentArtifact = {
      artifactId: "parent-1",
      schema: "hardkas.test",
      version: "1.0.0",
      mode: "simulated",
      networkId: "simnet",
      createdAt: new Date().toISOString()
    };
    const parentHash = calculateContentHash(parentArtifact);
    (parentArtifact as any).contentHash = parentHash;

    const artifact = {
      artifactId: "child-1",
      schema: "hardkas.test",
      version: "1.0.0-alpha",
      mode: "simulated",
      networkId: "simnet",
      createdAt: new Date().toISOString(),
      lineage: {
        lineageId: "lin-1",
        parentArtifactId: "parent-1",
        sequence: 1
      }
    };
    (artifact as any).contentHash = calculateContentHash(artifact);

    await fs.writeFile(
      path.join(hardkasDir, "parent-artifact.json"),
      JSON.stringify(parentArtifact)
    );

    await fs.writeFile(
      path.join(hardkasDir, "child-artifact.json"),
      JSON.stringify(artifact)
    );

    const indexer = new HardkasIndexer(store.getDatabase(), { cwd: tmpDir });
    indexer.sync();

    const db = store.getDatabase();
    const artCount = (db.prepare("SELECT COUNT(*) as count FROM artifacts").get() as any).count;
    assert.strictEqual(artCount, 2, "Should have 2 artifacts indexed");

    const edges = db.prepare("SELECT parent_artifact_id, child_artifact_id FROM lineage_edges").all() as any[];
    assert.strictEqual(edges.length, 1, "Should have 1 lineage edge");
    assert.strictEqual(edges[0].parent_artifact_id, "parent-1");
    assert.strictEqual(edges[0].child_artifact_id, "child-1");
  });

  it("should perform idempotent re-indexing", async () => {
    const artifact = {
      artifactId: "art-idempotent",
      schema: "hardkas.test",
      version: "1.0.0-alpha",
      mode: "simulated",
      networkId: "simnet",
      createdAt: new Date().toISOString()
    };
    (artifact as any).contentHash = calculateContentHash(artifact);

    await fs.writeFile(
      path.join(hardkasDir, "artifact.json"),
      JSON.stringify(artifact)
    );

    const indexer = new HardkasIndexer(store.getDatabase(), { cwd: tmpDir });
    indexer.sync();
    indexer.sync(); // Second sync
    indexer.sync(); // Third sync

    const db = store.getDatabase();
    const count = (db.prepare("SELECT COUNT(*) as count FROM artifacts").get() as any).count;
    assert.strictEqual(count, 1); // Should still be 1
  });

  it("should skip corrupt artifacts gracefully", async () => {
    await fs.writeFile(
      path.join(hardkasDir, "corrupt.json"),
      "{ invalid json format "
    );

    const validArtifact = {
      artifactId: "valid-1",
      schema: "hardkas.test",
      version: "1.0.0-alpha",
      mode: "simulated",
      networkId: "simnet",
      createdAt: new Date().toISOString()
    };
    (validArtifact as any).contentHash = calculateContentHash(validArtifact);
    await fs.writeFile(
      path.join(hardkasDir, "valid.json"),
      JSON.stringify(validArtifact)
    );

    const indexer = new HardkasIndexer(store.getDatabase(), { cwd: tmpDir });
    assert.doesNotThrow(() => indexer.sync());

    const db = store.getDatabase();
    const count = (db.prepare("SELECT COUNT(*) as count FROM artifacts").get() as any).count;
    assert.strictEqual(count, 1); // Only the valid one should be indexed
  });
});
