import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { HardkasStore, HardkasIndexer } from "../src/index.js";
import { calculateContentHash } from "@hardkas/artifacts";
describe("HardkasIndexer", () => {
    let tmpDir;
    let hardkasDir;
    let store;
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
        const count = db.prepare("SELECT COUNT(*) as count FROM artifacts").get().count;
        assert.strictEqual(count, 0);
    });
    it("should index valid artifacts", async () => {
        const artifact = {
            schema: "hardkas.test",
            version: "1.0.0-alpha",
            mode: "simulated",
            networkId: "simnet",
            createdAt: new Date().toISOString(),
            payload: "hello world"
        };
        artifact.contentHash = calculateContentHash(artifact);
        await fs.writeFile(path.join(hardkasDir, "test-artifact.json"), JSON.stringify(artifact));
        const indexer = new HardkasIndexer(store.getDatabase(), { cwd: tmpDir });
        indexer.sync();
        const db = store.getDatabase();
        const count = db.prepare("SELECT COUNT(*) as count FROM artifacts").get().count;
        assert.strictEqual(count, 1);
        const row = db.prepare("SELECT hash, schema FROM artifacts").get();
        assert.strictEqual(row.hash, artifact.contentHash);
        assert.strictEqual(row.schema, "hardkas.test");
    });
    it("should index events.jsonl", async () => {
        const event1 = { kind: "workflow.test", txId: "tx1", timestamp: new Date().toISOString() };
        const event2 = { kind: "rpc.health", endpoint: "localhost", timestamp: new Date().toISOString() };
        await fs.writeFile(path.join(hardkasDir, "events.jsonl"), JSON.stringify(event1) + "\n" + JSON.stringify(event2) + "\n");
        const indexer = new HardkasIndexer(store.getDatabase(), { cwd: tmpDir });
        indexer.sync();
        const db = store.getDatabase();
        const rows = db.prepare("SELECT kind, tx_id FROM events ORDER BY id ASC").all();
        assert.strictEqual(rows.length, 2);
        assert.strictEqual(rows[0].kind, "workflow.test");
        assert.strictEqual(rows[0].tx_id, "tx1");
        assert.strictEqual(rows[1].kind, "rpc.health");
    });
    it("should index lineage edges", async () => {
        const parentArtifact = {
            schema: "hardkas.test",
            version: "1.0.0-alpha",
            mode: "simulated",
            networkId: "simnet",
            createdAt: new Date().toISOString()
        };
        const parentHash = calculateContentHash(parentArtifact);
        parentArtifact.contentHash = parentHash;
        const artifact = {
            schema: "hardkas.test",
            version: "1.0.0-alpha",
            mode: "simulated",
            networkId: "simnet",
            createdAt: new Date().toISOString(),
            lineage: {
                parentArtifactId: parentHash,
                sequence: 1
            }
        };
        artifact.contentHash = calculateContentHash(artifact);
        await fs.writeFile(path.join(hardkasDir, "parent-artifact.json"), JSON.stringify(parentArtifact));
        const indexer1 = new HardkasIndexer(store.getDatabase(), { cwd: tmpDir });
        indexer1.sync();
        await fs.writeFile(path.join(hardkasDir, "child-artifact.json"), JSON.stringify(artifact));
        const indexer = new HardkasIndexer(store.getDatabase(), { cwd: tmpDir });
        indexer.sync();
        const db = store.getDatabase();
        const edges = db.prepare("SELECT parent_hash, child_hash FROM lineage_edges").all();
        assert.strictEqual(edges.length, 1);
        assert.strictEqual(edges[0].parent_hash, parentHash);
        assert.strictEqual(edges[0].child_hash, artifact.contentHash);
    });
    it("should perform idempotent re-indexing", async () => {
        const artifact = {
            schema: "hardkas.test",
            version: "1.0.0-alpha",
            mode: "simulated",
            networkId: "simnet",
            createdAt: new Date().toISOString()
        };
        artifact.contentHash = calculateContentHash(artifact);
        await fs.writeFile(path.join(hardkasDir, "artifact.json"), JSON.stringify(artifact));
        const indexer = new HardkasIndexer(store.getDatabase(), { cwd: tmpDir });
        indexer.sync();
        indexer.sync(); // Second sync
        indexer.sync(); // Third sync
        const db = store.getDatabase();
        const count = db.prepare("SELECT COUNT(*) as count FROM artifacts").get().count;
        assert.strictEqual(count, 1); // Should still be 1
    });
    it("should skip corrupt artifacts gracefully", async () => {
        await fs.writeFile(path.join(hardkasDir, "corrupt.json"), "{ invalid json format ");
        const validArtifact = {
            schema: "hardkas.test",
            version: "1.0.0-alpha",
            mode: "simulated",
            networkId: "simnet",
            createdAt: new Date().toISOString()
        };
        validArtifact.contentHash = calculateContentHash(validArtifact);
        await fs.writeFile(path.join(hardkasDir, "valid.json"), JSON.stringify(validArtifact));
        const indexer = new HardkasIndexer(store.getDatabase(), { cwd: tmpDir });
        assert.doesNotThrow(() => indexer.sync());
        const db = store.getDatabase();
        const count = db.prepare("SELECT COUNT(*) as count FROM artifacts").get().count;
        assert.strictEqual(count, 1); // Only the valid one should be indexed
    });
    it("should support raw SQL query smoke test", () => {
        const db = store.getDatabase();
        db.exec(`
      INSERT INTO artifacts (hash, schema, version, mode, network_id, created_at, path, raw_json)
      VALUES ('hash1', 'hardkas.sql', '1.0', 'sim', 'net', '2025', 'path/a.json', '{}');
    `);
        const result = db.prepare("SELECT schema FROM artifacts WHERE hash = ?").get('hash1');
        assert.strictEqual(result.schema, 'hardkas.sql');
    });
});
//# sourceMappingURL=indexer.test.js.map