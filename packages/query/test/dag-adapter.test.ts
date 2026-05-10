import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { QueryEngine, createQueryRequest } from "../src/engine.js";

describe("DagQueryAdapter", () => {
  let tmpDir: string;
  let engine: QueryEngine;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-dag-"));
    const hardkasDir = path.join(tmpDir, ".hardkas");
    await fs.mkdir(hardkasDir, { recursive: true });

    // Simulated DAG state
    const dagState = {
      dag: {
        blocks: {
          "block-genesis": {
            id: "block-genesis",
            parents: [],
            blueScore: "0",
            daaScore: "0",
            acceptedTxIds: [],
            isGenesis: true
          },
          "block-1": {
            id: "block-1",
            parents: ["block-genesis"],
            blueScore: "1",
            daaScore: "1",
            acceptedTxIds: ["tx-alice-1"]
          },
          "block-2": {
            id: "block-2",
            parents: ["block-1"],
            blueScore: "2",
            daaScore: "2",
            acceptedTxIds: ["tx-alice-2"]
          },
          "block-orphan": {
            id: "block-orphan",
            parents: ["block-detached"],
            blueScore: "1",
            daaScore: "1",
            acceptedTxIds: ["tx-orphan"]
          }
        },
        sink: "block-2",
        selectedPathToSink: ["block-genesis", "block-1", "block-2"],
        acceptedTxIds: ["tx-alice-1", "tx-alice-2"],
        displacedTxIds: ["tx-bob-1"],
        conflictSet: [
          {
            outpoint: "utxo:abc:0",
            winnerTxId: "tx-alice-1",
            loserTxIds: ["tx-bob-1"]
          }
        ]
      }
    };

    await fs.writeFile(path.join(hardkasDir, "state.json"), JSON.stringify(dagState));
    engine = new QueryEngine({ artifactDir: tmpDir });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ─── Conflicts ─────────────────────────────────────────────────────────

  it("conflicts — should list double-spend conflicts", async () => {
    const result = await engine.execute(createQueryRequest({ domain: "dag", op: "conflicts" }));
    expect(result.total).toBe(1);
    const conflict: any = result.items[0];
    expect(conflict.outpoint).toBe("utxo:abc:0");
    expect(conflict.winnerTxId).toBe("tx-alice-1");
    expect(conflict.loserTxIds).toContain("tx-bob-1");
  });

  it("conflicts — with explain shows deterministic-light-model", async () => {
    const result = await engine.execute(createQueryRequest({ domain: "dag", op: "conflicts", explain: "full" }));
    expect(result.explain).toBeDefined();
    expect(result.explain![0]!.model).toBe("deterministic-light-model");
    // Verify NOT GHOSTDAG warning appears in conclusion
    expect(result.explain![0]!.conclusion).toContain("NOT GHOSTDAG");
  });

  // ─── Displaced ─────────────────────────────────────────────────────────

  it("displaced — should list displaced transactions", async () => {
    const result = await engine.execute(createQueryRequest({ domain: "dag", op: "displaced" }));
    expect(result.total).toBe(1);
    const d: any = result.items[0];
    expect(d.txId).toBe("tx-bob-1");
    expect(d.currentlyAccepted).toBe(false);
    expect(d.reason).toContain("utxo:abc:0");
  });

  // ─── History ───────────────────────────────────────────────────────────

  it("history — should return lifecycle for accepted tx", async () => {
    const result = await engine.execute(createQueryRequest({ domain: "dag", op: "history", params: { txId: "tx-alice-1" } }));
    expect(result.total).toBeGreaterThan(0);
    const entry: any = result.items[0];
    expect(entry.accepted).toBe(true);
    expect(entry.displaced).toBe(false);
    expect(entry.inSinkPath).toBe(true);
    expect(entry.blockId).toBe("block-1");
  });

  it("history — explain should carry NOT GHOSTDAG warning", async () => {
    const result = await engine.execute(createQueryRequest({ domain: "dag", op: "history", params: { txId: "tx-alice-1" }, explain: "full" }));
    expect(result.explain![0]!.conclusion).toContain("NOT GHOSTDAG");
  });

  // ─── Sink Path ─────────────────────────────────────────────────────────

  it("sink-path — should return genesis-to-sink path", async () => {
    const result = await engine.execute(createQueryRequest({ domain: "dag", op: "sink-path" }));
    const sp: any = result.items[0];
    expect(sp.sink).toBe("block-2");
    expect(sp.depth).toBe(3);
    expect(sp.nodes[0].isGenesis).toBe(true);
    expect(sp.nodes[2].blockId).toBe("block-2");
  });

  // ─── Anomalies ─────────────────────────────────────────────────────────

  it("anomalies — should detect displaced-never-reaccepted", async () => {
    const result = await engine.execute(createQueryRequest({ domain: "dag", op: "anomalies" }));
    const anomalies = result.items as any[];
    const displaced = anomalies.find((a: any) => a.kind === "displaced-never-reaccepted");
    expect(displaced).toBeDefined();
    expect(displaced.txId).toBe("tx-bob-1");
  });

  it("anomalies — should detect unreachable blocks", async () => {
    const result = await engine.execute(createQueryRequest({ domain: "dag", op: "anomalies" }));
    const anomalies = result.items as any[];
    const unreachable = anomalies.find((a: any) => a.kind === "unreachable-block");
    expect(unreachable).toBeDefined();
    expect(unreachable.blockId).toBe("block-orphan");
  });

  // ─── Determinism ───────────────────────────────────────────────────────

  it("determinism — same query produces same hash", async () => {
    const r1 = await engine.execute(createQueryRequest({ domain: "dag", op: "conflicts" }));
    const r2 = await engine.execute(createQueryRequest({ domain: "dag", op: "conflicts" }));
    expect(r1.queryHash).toBe(r2.queryHash);
  });

  // ─── Engine capabilities ──────────────────────────────────────────────

  it("engine lists all 4 domains", () => {
    const caps = engine.listCapabilities();
    const domains = caps.map(c => c.domain);
    expect(domains).toContain("artifacts");
    expect(domains).toContain("lineage");
    expect(domains).toContain("replay");
    expect(domains).toContain("dag");
  });
});
