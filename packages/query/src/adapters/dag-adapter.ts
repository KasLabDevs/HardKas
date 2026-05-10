/**
 * DAG Query Adapter.
 *
 * Provides: conflicts, displaced, history, sink-path, anomalies operations
 * over the SimulatedDag stored in LocalnetState.
 *
 * IMPORTANT: All results carry dagModel: "deterministic-light-model".
 * This is NOT GHOSTDAG consensus. It is a developer debugging tool.
 *
 * Source of truth: .hardkas/state.json → dag field
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { TxId } from "@hardkas/core";
import { computeQueryHash } from "../serialize.js";
import type {
  QueryAdapter,
  QueryRequest,
  QueryResult,
  DagConflict,
  DagDisplacement,
  DagTxHistory,
  DagSinkPath,
  DagSinkPathNode,
  DagAnomaly,
  ExplainChain,
  ReasoningStep
} from "../types.js";

/** Trust warning attached to every DAG query result. */
const DAG_MODEL_WARNING =
  "DAG queries reflect a deterministic light-model simulation. " +
  "This is NOT GHOSTDAG consensus. Results are valid for developer debugging only.";

// SimulatedDag shape (from @hardkas/localnet types)
interface SimDag {
  blocks: Record<string, SimBlock>;
  sink: string;
  selectedPathToSink: string[];
  acceptedTxIds: string[];
  displacedTxIds: string[];
  conflictSet: Array<{ outpoint: string; winnerTxId: string; loserTxIds: string[] }>;
}

interface SimBlock {
  id: string;
  parents: string[];
  blueScore: string;
  daaScore: string;
  acceptedTxIds: string[];
  isGenesis?: boolean;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class DagQueryAdapter implements QueryAdapter {
  readonly domain = "dag" as const;
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  supportedOps() {
    return ["conflicts", "displaced", "history", "sink-path", "anomalies"] as const;
  }

  supportedFilters() {
    return ["txId", "blockId", "daaScore"] as const;
  }

  async execute(request: QueryRequest): Promise<QueryResult> {
    switch (request.op) {
      case "conflicts":
        return this.executeConflicts(request);
      case "displaced":
        return this.executeDisplaced(request);
      case "history":
        return this.executeHistory(request);
      case "sink-path":
        return this.executeSinkPath(request);
      case "anomalies":
        return this.executeAnomalies(request);
      default:
        throw new Error(`Unknown dag op: ${request.op}`);
    }
  }

  // -------------------------------------------------------------------------
  // Conflicts — double-spend conflict analysis
  // -------------------------------------------------------------------------

  private async executeConflicts(request: QueryRequest): Promise<QueryResult> {
    const start = Date.now();
    const dag = await this.loadDag();

    if (!dag) {
      return emptyDagResult("conflicts", start);
    }

    const items: DagConflict[] = dag.conflictSet.map(c => ({
      outpoint: c.outpoint,
      winnerTxId: c.winnerTxId as TxId,
      loserTxIds: c.loserTxIds as TxId[]
    }));

    items.sort((a, b) => a.outpoint.localeCompare(b.outpoint));
    const paged = items.slice(request.offset, request.offset + request.limit);

    let explain: ExplainChain[] | undefined;
    if (request.explain) {
      explain = paged.map(c => explainConflict(c, dag));
    }

    return {
      domain: "dag",
      op: "conflicts",
      items: paged,
      total: items.length,
      truncated: items.length > request.offset + request.limit,
      deterministic: true,
      queryHash: computeQueryHash(paged),
      explain,
      annotations: { executedAt: new Date().toISOString(), executionMs: Date.now() - start }
    };
  }

  // -------------------------------------------------------------------------
  // Displaced — transactions that were accepted then displaced
  // -------------------------------------------------------------------------

  private async executeDisplaced(request: QueryRequest): Promise<QueryResult> {
    const start = Date.now();
    const dag = await this.loadDag();

    if (!dag) {
      return emptyDagResult("displaced", start);
    }

    const items: DagDisplacement[] = dag.displacedTxIds.map(txId => {
      // Check if this tx is in any conflict as a loser
      const conflict = dag.conflictSet.find(c => c.loserTxIds.includes(txId));
      const reason = conflict
        ? `Double-spend on outpoint ${conflict.outpoint}. Winner: ${conflict.winnerTxId}`
        : "Displaced by DAG reorganization";

      return {
        txId: txId as TxId,
        reason,
        currentlyAccepted: dag.acceptedTxIds.includes(txId)
      };
    });

    items.sort((a, b) => a.txId.localeCompare(b.txId));
    const paged = items.slice(request.offset, request.offset + request.limit);

    let explain: ExplainChain[] | undefined;
    if (request.explain) {
      explain = paged.map(d => explainDisplacement(d, dag));
    }

    return {
      domain: "dag",
      op: "displaced",
      items: paged,
      total: items.length,
      truncated: items.length > request.offset + request.limit,
      deterministic: true,
      queryHash: computeQueryHash(paged),
      explain,
      annotations: { executedAt: new Date().toISOString(), executionMs: Date.now() - start }
    };
  }

  // -------------------------------------------------------------------------
  // History — full lifecycle of a tx through the DAG
  // -------------------------------------------------------------------------

  private async executeHistory(request: QueryRequest): Promise<QueryResult> {
    const start = Date.now();
    const txId = request.params["txId"];
    if (!txId) throw new Error("history requires params.txId");

    const dag = await this.loadDag();
    if (!dag) throw new Error("No DAG state found. Run a simulation first.");

    // Find which block contains this tx
    const entries: DagTxHistory[] = [];
    for (const [blockId, block] of Object.entries(dag.blocks)) {
      if (!block) continue;
      if (block.acceptedTxIds.includes(txId)) {
        entries.push({
          txId: txId as TxId,
          blockId,
          accepted: dag.acceptedTxIds.includes(txId),
          displaced: dag.displacedTxIds.includes(txId),
          inSinkPath: dag.selectedPathToSink.includes(blockId),
          daaScore: block.daaScore
        });
      }
    }

    if (entries.length === 0) {
      // Check if it's in displaced but not in any block (shouldn't happen)
      if (dag.displacedTxIds.includes(txId)) {
        entries.push({
          txId: txId as TxId,
          blockId: "unknown",
          accepted: false,
          displaced: true,
          inSinkPath: false,
          daaScore: "0"
        });
      }
    }

    entries.sort((a, b) => a.daaScore.localeCompare(b.daaScore));

    let explain: ExplainChain[] | undefined;
    if (request.explain) {
      explain = entries.map(e => explainTxHistory(e, dag));
    }

    return {
      domain: "dag",
      op: "history",
      items: entries,
      total: entries.length,
      truncated: false,
      deterministic: true,
      queryHash: computeQueryHash(entries),
      explain,
      annotations: { executedAt: new Date().toISOString(), executionMs: Date.now() - start }
    };
  }

  // -------------------------------------------------------------------------
  // Sink Path — current selected path from genesis to sink
  // -------------------------------------------------------------------------

  private async executeSinkPath(request: QueryRequest): Promise<QueryResult> {
    const start = Date.now();
    const dag = await this.loadDag();

    if (!dag) {
      return emptyDagResult("sink-path", start);
    }

    const nodes: DagSinkPathNode[] = dag.selectedPathToSink.map(blockId => {
      const block = dag.blocks[blockId];
      return {
        blockId,
        daaScore: block?.daaScore ?? "0",
        acceptedTxCount: block?.acceptedTxIds.length ?? 0,
        isGenesis: block?.isGenesis ?? false
      };
    });

    const result: DagSinkPath = {
      nodes,
      sink: dag.sink,
      depth: nodes.length
    };

    return {
      domain: "dag",
      op: "sink-path",
      items: [result],
      total: 1,
      truncated: false,
      deterministic: true,
      queryHash: computeQueryHash([result]),
      annotations: { executedAt: new Date().toISOString(), executionMs: Date.now() - start }
    };
  }

  // -------------------------------------------------------------------------
  // Anomalies — transactions in unexpected states
  // -------------------------------------------------------------------------

  private async executeAnomalies(request: QueryRequest): Promise<QueryResult> {
    const start = Date.now();
    const dag = await this.loadDag();

    if (!dag) {
      return emptyDagResult("anomalies", start);
    }

    const anomalies: DagAnomaly[] = [];

    // 1. Displaced txs never re-accepted
    for (const txId of dag.displacedTxIds) {
      if (!dag.acceptedTxIds.includes(txId)) {
        anomalies.push({
          kind: "displaced-never-reaccepted",
          description: `Transaction ${txId} was displaced and has not been re-accepted`,
          txId
        });
      }
    }

    // 2. Blocks not reachable from sink
    const reachable = new Set<string>();
    const stack = [dag.sink];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      const block = dag.blocks[id];
      if (block) {
        for (const p of block.parents) stack.push(p);
      }
    }

    for (const blockId of Object.keys(dag.blocks)) {
      if (!reachable.has(blockId)) {
        anomalies.push({
          kind: "unreachable-block",
          description: `Block ${blockId} is not reachable from current sink ${dag.sink}`,
          blockId
        });
      }
    }

    // 3. Tx in both accepted and displaced (invariant violation)
    for (const txId of dag.acceptedTxIds) {
      if (dag.displacedTxIds.includes(txId)) {
        anomalies.push({
          kind: "invariant-violation",
          description: `Transaction ${txId} is in both acceptedTxIds and displacedTxIds`,
          txId
        });
      }
    }

    anomalies.sort((a, b) => a.kind.localeCompare(b.kind));
    const paged = anomalies.slice(request.offset, request.offset + request.limit);

    let explain: ExplainChain[] | undefined;
    if (request.explain) {
      explain = paged.map(a => explainAnomaly(a, dag));
    }

    return {
      domain: "dag",
      op: "anomalies",
      items: paged,
      total: anomalies.length,
      truncated: anomalies.length > request.offset + request.limit,
      deterministic: true,
      queryHash: computeQueryHash(paged),
      explain,
      annotations: { executedAt: new Date().toISOString(), executionMs: Date.now() - start }
    };
  }

  // -------------------------------------------------------------------------
  // Load DAG from state.json
  // -------------------------------------------------------------------------

  private async loadDag(): Promise<SimDag | null> {
    const statePath = path.join(this.rootDir, ".hardkas", "state.json");
    try {
      const content = await fs.readFile(statePath, "utf-8");
      const state = JSON.parse(content);
      return state.dag ?? null;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Empty result helper
// ---------------------------------------------------------------------------

function emptyDagResult(op: string, start: number): QueryResult {
  return {
    domain: "dag",
    op,
    items: [],
    total: 0,
    truncated: false,
    deterministic: true,
    queryHash: computeQueryHash([]),
    annotations: { executedAt: new Date().toISOString(), executionMs: Date.now() - start }
  };
}

// ---------------------------------------------------------------------------
// Explain — DAG
// ---------------------------------------------------------------------------

function explainConflict(conflict: DagConflict, dag: SimDag): ExplainChain {
  const steps: ReasoningStep[] = [];
  let order = 1;

  // Find the winner's block
  let winnerBlockId: string | undefined;
  let winnerDaaScore = "0";
  let winnerInSinkPath = false;
  for (const [blockId, block] of Object.entries(dag.blocks)) {
    if (block?.acceptedTxIds.includes(conflict.winnerTxId)) {
      winnerBlockId = blockId;
      winnerDaaScore = block.daaScore;
      winnerInSinkPath = dag.selectedPathToSink.includes(blockId);
      break;
    }
  }

  steps.push({
    order: order++,
    assertion: `Outpoint ${conflict.outpoint} was spent by multiple transactions`,
    evidence: `Winner: ${conflict.winnerTxId}, Losers: ${conflict.loserTxIds.join(", ")}`,
    rule: "UTXO double-spend detection (dag.ts:moveSink)"
  });

  if (winnerBlockId) {
    steps.push({
      order: order++,
      assertion: `Winner tx is in block ${winnerBlockId} (daaScore: ${winnerDaaScore})`,
      evidence: `Block ${winnerBlockId} contains tx ${conflict.winnerTxId}`,
      rule: "Block tx membership"
    });

    steps.push({
      order: order++,
      assertion: winnerInSinkPath
        ? `Block ${winnerBlockId} IS in the sink path — has priority`
        : `Block ${winnerBlockId} is NOT in the sink path`,
      evidence: `selectedPathToSink.includes("${winnerBlockId}") = ${winnerInSinkPath}`,
      rule: "Sink-ancestry priority (dag.ts:resolveConflictsDeterministically)"
    });
  }

  steps.push({
    order: order++,
    assertion: `Conflict resolved: ${conflict.winnerTxId.slice(0, 16)}... accepted, ${conflict.loserTxIds.length} tx(s) displaced`,
    evidence: `Resolution based on: 1) sink-path priority, 2) daaScore ordering, 3) blockId tie-break`,
    rule: "Deterministic conflict resolution (dag.ts:187-248)"
  });

  return {
    question: `Why did ${conflict.winnerTxId.slice(0, 16)}... win the conflict on outpoint ${conflict.outpoint}?`,
    conclusion: `Winner has ${winnerInSinkPath ? "sink-path priority" : "block ordering priority"}. ${conflict.loserTxIds.length} tx(s) displaced. Model: deterministic-light-model (NOT GHOSTDAG).`,
    steps,
    model: "deterministic-light-model",
    confidence: "definitive",
    references: [conflict.winnerTxId, ...conflict.loserTxIds]
  };
}

function explainDisplacement(d: DagDisplacement, _dag: SimDag): ExplainChain {
  return {
    question: `Why was tx ${d.txId.slice(0, 16)}... displaced?`,
    conclusion: `${d.reason}. Currently accepted: ${d.currentlyAccepted}. Model: deterministic-light-model (NOT GHOSTDAG).`,
    steps: [
      { order: 1, assertion: `Transaction ${d.txId.slice(0, 16)}... is in displacedTxIds`, evidence: `dag.displacedTxIds includes "${d.txId}"`, rule: "DAG sink movement (dag.ts:moveSink)" },
      { order: 2, assertion: d.reason, evidence: d.reason, rule: "Conflict resolution or DAG reorganization" }
    ],
    model: "deterministic-light-model",
    confidence: "definitive",
    references: [d.txId]
  };
}

function explainTxHistory(entry: DagTxHistory, _dag: SimDag): ExplainChain {
  const status = entry.accepted ? "ACCEPTED" : entry.displaced ? "DISPLACED" : "UNKNOWN";
  return {
    question: `What is the DAG lifecycle status of tx ${entry.txId.slice(0, 16)}...?`,
    conclusion: `Status: ${status}. Block: ${entry.blockId} (daaScore: ${entry.daaScore}). In sink path: ${entry.inSinkPath}. Model: deterministic-light-model (NOT GHOSTDAG).`,
    steps: [
      { order: 1, assertion: `Transaction is in block ${entry.blockId}`, evidence: `block.acceptedTxIds includes "${entry.txId}"`, rule: "Block membership scan" },
      { order: 2, assertion: `Block daaScore = ${entry.daaScore}`, evidence: `dag.blocks["${entry.blockId}"].daaScore = "${entry.daaScore}"` },
      { order: 3, assertion: entry.inSinkPath ? "Block IS in selected path to sink" : "Block is NOT in selected path to sink", evidence: `selectedPathToSink.includes("${entry.blockId}") = ${entry.inSinkPath}`, rule: "Sink path computation (dag.ts:calculateSelectedPath)" },
      { order: 4, assertion: `Current status: ${status}`, evidence: `accepted=${entry.accepted}, displaced=${entry.displaced}`, rule: "DAG accepted/displaced set membership" }
    ],
    model: "deterministic-light-model",
    confidence: "definitive",
    references: [entry.txId]
  };
}

function explainAnomaly(a: DagAnomaly, _dag: SimDag): ExplainChain {
  return {
    question: `Why is this a DAG anomaly?`,
    conclusion: `${a.description}. Model: deterministic-light-model (NOT GHOSTDAG).`,
    steps: [
      { order: 1, assertion: a.description, evidence: `Anomaly kind: ${a.kind}`, rule: "DAG invariant check (query/dag-adapter.ts)" }
    ],
    model: "deterministic-light-model",
    confidence: "definitive",
    references: [a.txId ?? a.blockId ?? ""]
  };
}
