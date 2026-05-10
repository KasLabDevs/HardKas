/**
 * Phase 6: Events and Tx adapter tests.
 * Tests: events query, tx aggregation, type-aware filters, explain output.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { QueryEngine, createQueryRequest } from "../src/engine.js";
import { evaluateFilter, evaluateFilters } from "../src/filter.js";
import { serializeQueryResult } from "../src/serialize.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let tmpDir: string;

function makeEvent(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    schema: "hardkas.event",
    version: "1.0.0",
    eventId: `evt-${Math.random().toString(36).slice(2, 10)}`,
    domain: "workflow",
    kind: "workflow.started",
    timestamp: "2025-01-15T10:00:00.000Z",
    workflowId: "wf-test-1",
    correlationId: "cor-test-1",
    networkId: "kaspa-testnet-11",
    payload: { workflowId: "wf-test-1", network: "kaspa-testnet-11" },
    ...overrides
  });
}

function makeArtifact(schema: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    schema,
    version: "2.0.0",
    networkId: "kaspa-testnet-11",
    mode: "simulated",
    createdAt: "2025-01-15T10:00:00.000Z",
    artifactId: `art-${Math.random().toString(36).slice(2, 10)}`,
    ...overrides
  }, null, 2);
}

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-phase6-"));
  const hardkasDir = path.join(tmpDir, ".hardkas");
  fs.mkdirSync(hardkasDir, { recursive: true });

  // Create events.jsonl
  const events = [
    makeEvent({ eventId: "evt-001", kind: "workflow.started", timestamp: "2025-01-15T10:00:00.000Z", txId: "tx-abc" }),
    makeEvent({ eventId: "evt-002", kind: "workflow.plan.created", timestamp: "2025-01-15T10:01:00.000Z", txId: "tx-abc", domain: "workflow" }),
    makeEvent({ eventId: "evt-003", kind: "workflow.signed", timestamp: "2025-01-15T10:02:00.000Z", txId: "tx-abc" }),
    makeEvent({ eventId: "evt-004", kind: "integrity.hash_mismatch", timestamp: "2025-01-15T10:03:00.000Z", domain: "integrity" }),
    makeEvent({ eventId: "evt-005", kind: "workflow.completed", timestamp: "2025-01-15T10:04:00.000Z", txId: "tx-def", workflowId: "wf-test-2" }),
  ];
  fs.writeFileSync(path.join(hardkasDir, "events.jsonl"), events.join("\n") + "\n");

  // Create artifact files
  fs.writeFileSync(path.join(hardkasDir, "plan-1.json"), makeArtifact("hardkas.txPlan", { txId: "tx-abc" }));
  fs.writeFileSync(path.join(hardkasDir, "signed-1.json"), makeArtifact("hardkas.signedTx", { txId: "tx-abc" }));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Events adapter tests
// ---------------------------------------------------------------------------

describe("EventsQueryAdapter", () => {
  it("should list all events", async () => {
    const engine = new QueryEngine({ artifactDir: tmpDir });
    const req = createQueryRequest({ domain: "events", op: "list" });
    const result = await engine.execute(req);

    expect(result.domain).toBe("events");
    expect(result.total).toBe(5);
    expect(result.deterministic).toBe(true);
  });

  it("should filter events by --tx", async () => {
    const engine = new QueryEngine({ artifactDir: tmpDir });
    const req = createQueryRequest({
      domain: "events",
      op: "list",
      params: { tx: "tx-abc" }
    });
    const result = await engine.execute(req);

    expect(result.total).toBe(3);
    for (const item of result.items) {
      expect((item as Record<string, unknown>).txId).toBe("tx-abc");
    }
  });

  it("should filter events by domain", async () => {
    const engine = new QueryEngine({ artifactDir: tmpDir });
    const req = createQueryRequest({
      domain: "events",
      op: "list",
      filters: [{ field: "domain", op: "eq", value: "integrity" }]
    });
    const result = await engine.execute(req);

    expect(result.total).toBe(1);
    expect((result.items[0] as Record<string, unknown>).kind).toBe("integrity.hash_mismatch");
  });

  it("should return deterministic ordering by timestamp+eventId", async () => {
    const engine = new QueryEngine({ artifactDir: tmpDir });
    const req = createQueryRequest({ domain: "events", op: "list" });
    const result = await engine.execute(req);

    const timestamps = result.items.map((i: any) => i.timestamp);
    const sorted = [...timestamps].sort();
    expect(timestamps).toEqual(sorted);
  });

  it("should include explain metadata when requested", async () => {
    const engine = new QueryEngine({ artifactDir: tmpDir });
    const req = createQueryRequest({
      domain: "events",
      op: "list",
      explain: "brief"
    });
    const result = await engine.execute(req);

    expect(result.explain).toBeDefined();
    expect(result.explain!.length).toBeGreaterThan(0);
    expect(result.explain![0].conclusion).toContain("events");
  });
});

// ---------------------------------------------------------------------------
// Tx adapter tests
// ---------------------------------------------------------------------------

describe("TxQueryAdapter", () => {
  it("should aggregate artifacts and events for a txId", async () => {
    const engine = new QueryEngine({ artifactDir: tmpDir });
    const req = createQueryRequest({
      domain: "tx",
      op: "aggregate",
      params: { txId: "tx-abc" }
    });
    const result = await engine.execute(req);

    expect(result.domain).toBe("tx");
    expect(result.total).toBe(1);
    const agg = result.items[0] as Record<string, unknown>;
    expect(agg.txId).toBe("tx-abc");
    expect((agg.artifacts as unknown[]).length).toBeGreaterThan(0);
    expect((agg.events as unknown[]).length).toBeGreaterThan(0);
  });

  it("should report warnings for missing artifacts", async () => {
    const engine = new QueryEngine({ artifactDir: tmpDir });
    const req = createQueryRequest({
      domain: "tx",
      op: "aggregate",
      params: { txId: "tx-nonexistent" }
    });
    const result = await engine.execute(req);

    const agg = result.items[0] as Record<string, unknown>;
    expect(agg.complete).toBe(false);
    expect((agg.warnings as string[]).length).toBeGreaterThan(0);
  });

  it("should include explain with completeness info", async () => {
    const engine = new QueryEngine({ artifactDir: tmpDir });
    const req = createQueryRequest({
      domain: "tx",
      op: "aggregate",
      params: { txId: "tx-abc" },
      explain: "full"
    });
    const result = await engine.execute(req);

    expect(result.explain).toBeDefined();
    expect(result.explain![0].steps.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Type-aware filter tests
// ---------------------------------------------------------------------------

describe("Type-aware filters", () => {
  it("should use strict equality (no String coercion)", () => {
    // String "42" should not match number 42
    expect(evaluateFilter({ val: 42 }, { field: "val", op: "eq", value: "42" })).toBe(false);
    // Same type should match
    expect(evaluateFilter({ val: "hello" }, { field: "val", op: "eq", value: "hello" })).toBe(true);
  });

  it("should return false for invalid numeric comparisons (not NaN => 0)", () => {
    expect(evaluateFilter({ val: "not-a-number" }, { field: "val", op: "gt", value: "10" })).toBe(false);
    expect(evaluateFilter({ val: undefined }, { field: "val", op: "lt", value: "5" })).toBe(false);
  });

  it("should handle bigint comparisons", () => {
    expect(evaluateFilter({ val: BigInt(1000) }, { field: "val", op: "gt", value: "500" })).toBe(true);
    expect(evaluateFilter({ val: BigInt(100) }, { field: "val", op: "lt", value: "500" })).toBe(true);
  });

  it("should handle exists filter", () => {
    expect(evaluateFilter({ val: "present" }, { field: "val", op: "exists", value: true })).toBe(true);
    expect(evaluateFilter({}, { field: "val", op: "exists", value: true })).toBe(false);
    expect(evaluateFilter({ val: null }, { field: "val", op: "exists", value: true })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// JSON output tests
// ---------------------------------------------------------------------------

describe("JSON output stability", () => {
  it("should produce stable machine-readable JSON", async () => {
    const engine = new QueryEngine({ artifactDir: tmpDir });
    const req = createQueryRequest({ domain: "events", op: "list", params: { tx: "tx-abc" } });
    const result = await engine.execute(req);
    const json = serializeQueryResult(result);

    // Should be valid JSON
    const parsed = JSON.parse(json);
    expect(parsed.domain).toBe("events");
    expect(parsed.items).toBeDefined();
    expect(parsed.queryHash).toBeDefined();
    expect(parsed.deterministic).toBe(true);
  });

  it("should produce identical queryHash for same data", async () => {
    const engine = new QueryEngine({ artifactDir: tmpDir });
    const req = createQueryRequest({ domain: "events", op: "list", params: { tx: "tx-abc" } });
    
    const result1 = await engine.execute(req);
    const result2 = await engine.execute(req);
    
    expect(result1.queryHash).toBe(result2.queryHash);
  });
});
