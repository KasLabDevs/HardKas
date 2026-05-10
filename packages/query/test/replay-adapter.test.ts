import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { QueryEngine, createQueryRequest } from "../src/engine.js";

describe("ReplayQueryAdapter", () => {
  let tmpDir: string;
  let engine: QueryEngine;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-replay-"));
    const receiptsDir = path.join(tmpDir, ".hardkas", "receipts");
    const tracesDir = path.join(tmpDir, ".hardkas", "traces");
    await fs.mkdir(receiptsDir, { recursive: true });
    await fs.mkdir(tracesDir, { recursive: true });

    // Receipt: confirmed tx
    await fs.writeFile(path.join(receiptsDir, "tx-abc.json"), JSON.stringify({
      schema: "hardkas.txReceipt",
      txId: "tx-abc",
      status: "confirmed",
      mode: "simulated",
      networkId: "simnet",
      from: { address: "kaspa:alice" },
      to: { address: "kaspa:bob" },
      amountSompi: "100000",
      feeSompi: "250",
      mass: "250",
      daaScore: "42",
      spentUtxoIds: ["u1", "u2"],
      createdUtxoIds: ["u3", "u4"],
      preStateHash: "pre123",
      postStateHash: "post456",
      createdAt: "2026-01-01T00:00:00Z"
    }));

    // Receipt: failed tx (with state change — divergence)
    await fs.writeFile(path.join(receiptsDir, "tx-fail.json"), JSON.stringify({
      schema: "hardkas.txReceipt",
      txId: "tx-fail",
      status: "failed",
      mode: "simulated",
      networkId: "simnet",
      from: { address: "kaspa:alice" },
      to: { address: "kaspa:bob" },
      amountSompi: "100000",
      feeSompi: "0",
      daaScore: "43",
      spentUtxoIds: [],
      createdUtxoIds: [],
      preStateHash: "pre123",
      postStateHash: "post789", // BUG: failed tx changed state
      createdAt: "2026-01-01T00:01:00Z"
    }));

    // Trace for tx-abc
    await fs.writeFile(path.join(tracesDir, "tx-abc.trace.json"), JSON.stringify({
      schema: "hardkas.txTrace",
      txId: "tx-abc",
      mode: "simulated",
      networkId: "simnet",
      events: [
        { type: "phase.started", phase: "validation", timestamp: 1000 },
        { type: "phase.completed", phase: "validation", timestamp: 1001 },
        { type: "phase.started", phase: "execution", timestamp: 1002 },
        { type: "phase.completed", phase: "execution", timestamp: 1003 }
      ],
      createdAt: "2026-01-01T00:00:00Z"
    }));

    engine = new QueryEngine({ artifactDir: tmpDir });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("list — should enumerate receipts", async () => {
    const result = await engine.execute(createQueryRequest({ domain: "replay", op: "list" }));
    expect(result.total).toBe(2);
    expect(result.items.length).toBe(2);
    expect(result.deterministic).toBe(true);
  });

  it("summary — should return detailed summary for a txId", async () => {
    const result = await engine.execute(createQueryRequest({ domain: "replay", op: "summary", params: { txId: "tx-abc" } }));
    expect(result.total).toBe(1);
    const summary: any = result.items[0];
    expect(summary.txId).toBe("tx-abc");
    expect(summary.hasTrace).toBe(true);
    expect(summary.traceEventCount).toBe(4);
    expect(summary.spentUtxoCount).toBe(2);
    expect(summary.createdUtxoCount).toBe(2);
  });

  it("divergences — should detect failed tx with state change", async () => {
    const result = await engine.execute(createQueryRequest({ domain: "replay", op: "divergences" }));
    expect(result.total).toBeGreaterThan(0);
    const divs = result.items as any[];
    const failDiv = divs.find((d: any) => d.txId === "tx-fail" && d.kind === "status-mismatch");
    expect(failDiv).toBeDefined();
    expect(failDiv.field).toBe("status");
  });

  it("divergences — should produce explain chains", async () => {
    const result = await engine.execute(createQueryRequest({ domain: "replay", op: "divergences", explain: "brief" }));
    if (result.total > 0 && result.why) {
      expect(result.why.length).toBeGreaterThan(0);
      expect(result.why[0]!.model).toBe("replay-analysis");
    }
  });

  it("invariants — should check all invariants for a confirmed tx", async () => {
    const result = await engine.execute(createQueryRequest({ domain: "replay", op: "invariants", params: { txId: "tx-abc" } }));
    const inv: any = result.items[0];
    expect(inv.txId).toBe("tx-abc");
    expect(inv.stateTransitionValid).toBe(true);
    expect(inv.utxoConservation).toBe(true);
    expect(inv.receiptReproducible).toBe(true);
  });

  it("invariants — should detect state transition issue on failed tx", async () => {
    const result = await engine.execute(createQueryRequest({ domain: "replay", op: "invariants", params: { txId: "tx-fail" } }));
    const inv: any = result.items[0];
    expect(inv.stateTransitionValid).toBe(false);
    expect(inv.issues.length).toBeGreaterThan(0);
  });

  it("determinism — same query produces same queryHash", async () => {
    const r1 = await engine.execute(createQueryRequest({ domain: "replay", op: "list" }));
    const r2 = await engine.execute(createQueryRequest({ domain: "replay", op: "list" }));
    expect(r1.queryHash).toBe(r2.queryHash);
  });
});
