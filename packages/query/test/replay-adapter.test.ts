import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { calculateContentHash, CURRENT_HASH_VERSION, planRelayMinimum } from "@hardkas/artifacts";
import { QueryEngine, createQueryRequest } from "../src/engine.js";

// Wave 1.3 re-base (IC-2′.8 / IC-4′.4): status-based divergences and invariants are
// judged only for receipts whose hash authenticates the status (hashVersion 5), so
// the fixtures are sealed under the current version. The properties tested are unchanged.
const sealed = (body: Record<string, unknown>) => {
  const a: any = { ...body, hashVersion: CURRENT_HASH_VERSION };
  a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
  return JSON.stringify(a);
};

describe("ReplayQueryAdapter", () => {
  let tmpDir: string;
  let engine: QueryEngine;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-replay-"));
    // WORKSPACE-AUTHORITY-1 (C1): the artifact store the resolver reads (receipts/ and the store root for traces)
    const receiptsDir = path.join(tmpDir, ".hardkas", "artifacts", "receipts");
    const tracesDir = path.join(tmpDir, ".hardkas", "artifacts");
    await fs.mkdir(receiptsDir, { recursive: true });
    await fs.mkdir(tracesDir, { recursive: true });

    // Receipt: confirmed tx
    await fs.writeFile(
      path.join(receiptsDir, "tx-abc.json"),
      sealed({
        schema: "hardkas.txReceipt",
        txId: "tx-abc",
        status: "confirmed",
        mode: "simulator",
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
      })
    );

    // Receipt: failed tx (with state change — divergence)
    await fs.writeFile(
      path.join(receiptsDir, "tx-fail.json"),
      sealed({
        schema: "hardkas.txReceipt",
        txId: "tx-fail",
        status: "failed",
        mode: "simulator",
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
      })
    );

    // Trace for tx-abc
    await fs.writeFile(
      path.join(tracesDir, "tx-abc.trace.json"),
      JSON.stringify({
        schema: "hardkas.txTrace",
        txId: "tx-abc",
        mode: "simulator",
        networkId: "simnet",
        events: [
          { type: "phase.started", phase: "validation", timestamp: 1000 },
          { type: "phase.completed", phase: "validation", timestamp: 1001 },
          { type: "phase.started", phase: "execution", timestamp: 1002 },
          { type: "phase.completed", phase: "execution", timestamp: 1003 }
        ],
        createdAt: "2026-01-01T00:00:00Z"
      })
    );

    engine = new QueryEngine({ artifactDir: tmpDir });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("list — should enumerate receipts", async () => {
    const result = await engine.execute(
      createQueryRequest({ domain: "replay", op: "list" })
    );
    expect(result.total).toBe(2);
    expect(result.items.length).toBe(2);
    expect(result.deterministic).toBe(true);
  });

  it("summary — should return detailed summary for a txId", async () => {
    const result = await engine.execute(
      createQueryRequest({ domain: "replay", op: "summary", params: { txId: "tx-abc" } })
    );
    expect(result.total).toBe(1);
    const summary: any = result.items[0];
    expect(summary.txId).toBe("tx-abc");
    expect(summary.hasTrace).toBe(true);
    expect(summary.traceEventCount).toBe(4);
    expect(summary.spentUtxoCount).toBe(2);
    expect(summary.createdUtxoCount).toBe(2);
  });

  it("divergences — should detect failed tx with state change", async () => {
    const result = await engine.execute(
      createQueryRequest({ domain: "replay", op: "divergences" })
    );
    expect(result.total).toBeGreaterThan(0);
    const divs = result.items as any[];
    const failDiv = divs.find(
      (d: any) => d.txId === "tx-fail" && d.kind === "status-mismatch"
    );
    expect(failDiv).toBeDefined();
    expect(failDiv.field).toBe("status");
  });

  it("divergences — should produce explain chains", async () => {
    const result = await engine.execute(
      createQueryRequest({ domain: "replay", op: "divergences", explain: "brief" })
    );
    if (result.total > 0 && result.why) {
      expect(result.why.length).toBeGreaterThan(0);
      // ESCALÓN 2 · P9: static analysis of stored receipts, never called a replay
      expect(result.why[0]!.model).toBe("static-analysis");
      expect(result.why[0]!.answer).toMatch(/Nothing was re-executed/);
    }
  });

  it("invariants — should check all invariants for a confirmed tx", async () => {
    const result = await engine.execute(
      createQueryRequest({
        domain: "replay",
        op: "invariants",
        params: { txId: "tx-abc" }
      })
    );
    const inv: any = result.items[0];
    expect(inv.txId).toBe("tx-abc");
    expect(inv.analysis).toBe("static");
    expect(inv.stateChangeMatchesStatus).toBe(true);
    expect(inv.utxoCountsNonZero).toBe(true);
    expect(inv.stateHashesPresent).toBe(true);
    expect(inv).not.toHaveProperty("receiptReproducible");
    expect(inv).not.toHaveProperty("utxoConservation");
  });

  it("invariants — should detect state transition issue on failed tx", async () => {
    const result = await engine.execute(
      createQueryRequest({
        domain: "replay",
        op: "invariants",
        params: { txId: "tx-fail" }
      })
    );
    const inv: any = result.items[0];
    expect(inv.stateChangeMatchesStatus).toBe(false);
    expect(inv.issues.length).toBeGreaterThan(0);
  });

  // ESCALÓN 2 · P9: the fee rule is the node's relay minimum (100 sompi per gram of COMPUTE mass, priced from the receipt's
  // plan by the pinned SDK), not `fee > 10 × mass`, which flagged every payment at the standard rate. A storage-bound
  // payment records its storage mass, so 100 × the receipt's mass is no floor either.
  it("divergences — fee: judged against its plan's relay minimum; the standard rate, a priority fee and a storage-bound mass are never flagged", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-replay-fee-"));
    try {
      const store = path.join(dir, ".hardkas", "artifacts");
      await fs.mkdir(path.join(store, "receipts"), { recursive: true });
      await fs.mkdir(path.join(store, "plans"), { recursive: true });
      const address = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
      const plan: any = JSON.parse(
        sealed({
          schema: "hardkas.txPlan",
          networkId: "simnet",
          mode: "simulator",
          txVersion: 0,
          amountSompi: "100000000",
          estimatedMass: "10000",
          estimatedFeeSompi: "0",
          inputs: [{ outpoint: { transactionId: "ab".repeat(32), index: 0 }, amountSompi: "500000000000", scriptPublicKey: "20" + "cd".repeat(32) + "ac" }],
          outputs: [{ address, amountSompi: "100000000" }],
          change: { address, amountSompi: "499899000000" },
          createdAt: "2026-01-01T00:00:00Z"
        })
      );
      await fs.writeFile(path.join(store, "plans", "plan.json"), JSON.stringify(plan));
      const relay = planRelayMinimum(plan);
      expect(relay, "the pinned kaspa-wasm prices the plan").toBeDefined();
      const receipt = (txId: string, mass: string, feeSompi: bigint, root: string | undefined = plan.contentHash) =>
        sealed({
          schema: "hardkas.txReceipt",
          txId,
          status: "confirmed",
          mode: "simulator",
          networkId: "simnet",
          from: { address },
          to: { address },
          amountSompi: "100000000",
          feeSompi: feeSompi.toString(),
          mass,
          daaScore: "42",
          spentUtxoIds: ["u1"],
          createdUtxoIds: ["u2"],
          preStateHash: `pre-${txId}`,
          postStateHash: `post-${txId}`,
          ...(root ? { lineage: { artifactId: txId, rootArtifactId: root, parentArtifactId: root, lineageId: root, sequence: 2 } } : {}),
          createdAt: "2026-01-01T00:00:00Z"
        });
      const r = relay!.relayFeeSompi;
      // exactly the relay minimum, with the storage mass recorded (10000 g: 100 × it is above the fee)
      await fs.writeFile(path.join(store, "receipts", "std.json"), receipt("tx-std", "10000", r));
      // a priority fee, ten times the minimum (the old rule flagged it)
      await fs.writeFile(path.join(store, "receipts", "prio.json"), receipt("tx-prio", relay!.computeMass.toString(), r * 10n));
      // one sompi below the minimum: the one finding
      await fs.writeFile(path.join(store, "receipts", "low.json"), receipt("tx-low", relay!.computeMass.toString(), r - 1n));
      // no plan to price it from: not judged
      await fs.writeFile(path.join(store, "receipts", "orphan.json"), receipt("tx-orphan", "2036", 1n, "ef".repeat(32)));
      const result = await new QueryEngine({ artifactDir: dir }).execute(createQueryRequest({ domain: "replay", op: "divergences" }));
      const fee = (result.items as any[]).filter((d) => d.kind === "fee-mismatch");
      expect(fee.map((d) => d.txId)).toEqual(["tx-low"]);
      expect(fee[0].expected).toBe(`at least the relay minimum of its plan: ${r} sompi (compute mass ${relay!.computeMass})`);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("determinism — same query produces same queryHash", async () => {
    const r1 = await engine.execute(createQueryRequest({ domain: "replay", op: "list" }));
    const r2 = await engine.execute(createQueryRequest({ domain: "replay", op: "list" }));
    expect(r1.queryHash).toBe(r2.queryHash);
  });
});
