import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { HardkasStore } from "../src/db.js";
import { HardkasIndexer } from "../src/indexer.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createEventEnvelope, asWorkflowId, asCorrelationId, asNetworkId } from "@hardkas/core";

describe("HardkasIndexer Integrity", () => {
  let tmpDir: string;
  let dbPath: string;
  let store: HardkasStore;
  let db: any;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-indexer-test-v2-"));
    dbPath = path.join(tmpDir, "store.db");
    fs.mkdirSync(path.join(tmpDir, ".hardkas"), { recursive: true });
    store = new HardkasStore({ dbPath });
    store.connect({ autoMigrate: true });
    db = store.getDatabase();
  });

  afterEach(async () => {
    if (store) store.disconnect();
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should index events idempotently (no duplicates)", async () => {
    const indexer = new HardkasIndexer(db, { cwd: tmpDir });

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
    await indexer.sync();
    let count = store.getDatabase().prepare("SELECT COUNT(*) as count FROM events").get() as { count: number };
    expect(count.count).toBe(1);

    // Second sync (same file, same content)
    await indexer.sync();
    count = store.getDatabase().prepare("SELECT COUNT(*) as count FROM events").get() as { count: number };
    expect(count.count).toBe(1); // Should still be 1

    store.disconnect();
  });

  it("raw_json should store the full EventEnvelope", async () => {
    const indexer = new HardkasIndexer(db, { cwd: tmpDir });

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

    await indexer.sync();
    const row = store.getDatabase().prepare("SELECT raw_json FROM events LIMIT 1").get() as { raw_json: string };
    const parsed = JSON.parse(row.raw_json);
    expect(parsed.schema).toBe("hardkas.event");
    expect(parsed.eventId).toBe(event.eventId);

    store.disconnect();
  });

  it("should derive traces from workflow events", async () => {
    const indexer = new HardkasIndexer(db, { cwd: tmpDir });

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

    await indexer.sync();
    let trace = store.getDatabase().prepare("SELECT * FROM traces WHERE workflow_id = ?").get(wfId) as any;
    expect(trace).toBeTruthy();
    expect(trace.status).toBe("running");

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

    await indexer.sync();
    trace = store.getDatabase().prepare("SELECT * FROM traces WHERE workflow_id = ?").get(wfId) as any;
    expect(trace.status).toBe("completed");
    expect(trace.ended_at).toBe(e2.timestamp);

    store.disconnect();
  });
});
