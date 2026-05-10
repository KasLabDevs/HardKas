import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { HardkasStore } from "../src/db.js";
import { HardkasIndexer } from "../src/indexer.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createEventEnvelope, asWorkflowId, asCorrelationId, asNetworkId, asEventId } from "@hardkas/core";

describe("HardkasIndexer V2 (Phase 3)", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-indexer-test-v2-"));
    dbPath = path.join(tmpDir, "store.db");
    fs.mkdirSync(path.join(tmpDir, ".hardkas"), { recursive: true });
  });

  afterEach(async () => {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should index events idempotently (no duplicates)", () => {
    const store = new HardkasStore({ dbPath });
    store.connect();
    const indexer = new HardkasIndexer(store.getDatabase(), { cwd: tmpDir });

    const event = createEventEnvelope({
      kind: "workflow.started",
      domain: "workflow",
      workflowId: asWorkflowId("wf-1"),
      correlationId: asCorrelationId("corr-1"),
      networkId: asNetworkId("testnet-10"),
      payload: { workflowId: asWorkflowId("wf-1"), network: asNetworkId("testnet-10") }
    });

    const eventsPath = path.join(tmpDir, ".hardkas", "events.jsonl");
    fs.appendFileSync(eventsPath, JSON.stringify(event) + "\n");

    // First sync
    indexer.sync();
    let count = store.getDatabase().prepare("SELECT COUNT(*) as count FROM events").get() as { count: number };
    assert.strictEqual(count.count, 1);

    // Second sync (same file, same content)
    indexer.sync();
    count = store.getDatabase().prepare("SELECT COUNT(*) as count FROM events").get() as { count: number };
    assert.strictEqual(count.count, 1); // Should still be 1

    store.disconnect();
  });

  it("raw_json should store the full EventEnvelope", () => {
    const store = new HardkasStore({ dbPath });
    store.connect();
    const indexer = new HardkasIndexer(store.getDatabase(), { cwd: tmpDir });

    const event = createEventEnvelope({
      kind: "workflow.started",
      domain: "workflow",
      workflowId: asWorkflowId("wf-1"),
      correlationId: asCorrelationId("corr-1"),
      networkId: asNetworkId("testnet-10"),
      payload: { workflowId: asWorkflowId("wf-1"), network: asNetworkId("testnet-10") }
    });

    const eventsPath = path.join(tmpDir, ".hardkas", "events.jsonl");
    fs.appendFileSync(eventsPath, JSON.stringify(event) + "\n");

    indexer.sync();
    const row = store.getDatabase().prepare("SELECT raw_json FROM events LIMIT 1").get() as { raw_json: string };
    const parsed = JSON.parse(row.raw_json);
    assert.strictEqual(parsed.schema, "hardkas.event");
    assert.strictEqual(parsed.eventId, event.eventId);

    store.disconnect();
  });

  it("should derive traces from workflow events", () => {
    const store = new HardkasStore({ dbPath });
    store.connect();
    const indexer = new HardkasIndexer(store.getDatabase(), { cwd: tmpDir });

    const wfId = asWorkflowId("wf-trace-1");
    const e1 = createEventEnvelope({
      kind: "workflow.started",
      domain: "workflow",
      workflowId: wfId,
      correlationId: asCorrelationId("corr-1"),
      networkId: asNetworkId("testnet-10"),
      payload: { workflowId: wfId, network: asNetworkId("testnet-10") }
    });

    const eventsPath = path.join(tmpDir, ".hardkas", "events.jsonl");
    fs.appendFileSync(eventsPath, JSON.stringify(e1) + "\n");

    indexer.sync();
    let trace = store.getDatabase().prepare("SELECT * FROM traces WHERE workflow_id = ?").get(wfId) as any;
    assert.ok(trace);
    assert.strictEqual(trace.status, "running");

    // Add completion event
    const e2 = createEventEnvelope({
      kind: "workflow.completed",
      domain: "workflow",
      workflowId: wfId,
      correlationId: asCorrelationId("corr-1"),
      networkId: asNetworkId("testnet-10"),
      payload: { workflowId: wfId }
    });
    fs.appendFileSync(eventsPath, JSON.stringify(e2) + "\n");

    indexer.sync();
    trace = store.getDatabase().prepare("SELECT * FROM traces WHERE workflow_id = ?").get(wfId) as any;
    assert.strictEqual(trace.status, "completed");
    assert.strictEqual(trace.ended_at, e2.timestamp);

    store.disconnect();
  });
});
