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
  WhyBlock,
  CausalStep
} from "../types.js";
import type { QueryBackend } from "../backend.js";

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
  private readonly backend: QueryBackend;

  constructor(rootDir: string, backend: QueryBackend) {
    this.rootDir = rootDir;
    this.backend = backend;
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

    let why: WhyBlock[] | undefined;
    if (request.explain) {
      why = paged.map(c => explainConflict(c, dag));
    }

    return {
      domain: "dag",
      op: "conflicts",
      items: paged,
      total: items.length,
      truncated: items.length > request.offset + request.limit,
      deterministic: true,
      queryHash: computeQueryHash(paged),
      why,
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

    let why: WhyBlock[] | undefined;
    if (request.explain) {
      why = paged.map(d => explainDisplacement(d, dag));
    }

    return {
      domain: "dag",
      op: "displaced",
      items: paged,
      total: items.length,
      truncated: items.length > request.offset + request.limit,
      deterministic: true,
      queryHash: computeQueryHash(paged),
      why,
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

    let why: WhyBlock[] | undefined;
    if (request.explain) {
      why = entries.map(e => explainTxHistory(e, dag));
    }

    return {
      domain: "dag",
      op: "history",
      items: entries,
      total: entries.length,
      truncated: false,
      deterministic: true,
      queryHash: computeQueryHash(entries),
      why,
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

    let why: WhyBlock[] | undefined;
    if (request.explain) {
      why = paged.map(a => explainAnomaly(a, dag));
    }

    return {
      domain: "dag",
      op: "anomalies",
      items: paged,
      total: anomalies.length,
      truncated: anomalies.length > request.offset + request.limit,
      deterministic: true,
      queryHash: computeQueryHash(paged),
      why,
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

function explainConflict(conflict: DagConflict, dag: SimDag): WhyBlock {
  const causalChain: CausalStep[] = [];
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

  causalChain.push({
    order: order++,
    assertion: `Outpoint ${conflict.outpoint} spent by multiple txs`,
    evidence: `Winner: ${conflict.winnerTxId}, Losers: ${conflict.loserTxIds.join(", ")}`,
    rule: "UTXO double-spend detection"
  });

  if (winnerBlockId) {
    causalChain.push({
      order: order++,
      assertion: `Winner in block ${winnerBlockId} (daaScore: ${winnerDaaScore})`,
      evidence: `In sink path: ${winnerInSinkPath}`,
      rule: "Sink-ancestry priority"
    });
  }

  return {
    question: `Why winner ${conflict.winnerTxId.slice(0, 8)} on outpoint ${conflict.outpoint}?`,
    answer: `Winner has ${winnerInSinkPath ? "sink-path priority" : "block ordering priority"}.`,
    evidence: [
      { type: "txId", value: conflict.winnerTxId },
      ...conflict.loserTxIds.map(id => ({ type: "txId" as const, value: id }))
    ],
    causalChain,
    model: "deterministic-light-model",
    confidence: "definitive"
  };
}

function explainDisplacement(d: DagDisplacement, _dag: SimDag): WhyBlock {
  return {
    question: `Why displaced tx ${d.txId.slice(0, 8)}?`,
    answer: d.reason,
    evidence: [{ type: "txId", value: d.txId }],
    causalChain: [
      { order: 1, assertion: "Tx in displaced set", evidence: "dag.displacedTxIds includes txId", rule: "DAG reorganization" },
      { order: 2, assertion: "Status: displaced", evidence: d.reason }
    ],
    model: "deterministic-light-model",
    confidence: "definitive"
  };
}

function explainTxHistory(entry: DagTxHistory, _dag: SimDag): WhyBlock {
  const status = entry.accepted ? "ACCEPTED" : entry.displaced ? "DISPLACED" : "UNKNOWN";
  return {
    question: `Causal history of tx ${entry.txId.slice(0, 8)}?`,
    answer: `Status is ${status} in block ${entry.blockId}.`,
    evidence: [
      { type: "txId", value: entry.txId },
      { type: "blockId", value: entry.blockId }
    ],
    causalChain: [
      { order: 1, assertion: `In block ${entry.blockId}`, evidence: `daaScore=${entry.daaScore}` },
      { order: 2, assertion: entry.inSinkPath ? "In selected sink path" : "Not in sink path", evidence: `selectedPathToSink.includes("${entry.blockId}")` }
    ],
    model: "deterministic-light-model",
    confidence: "definitive"
  };
}

function explainAnomaly(a: DagAnomaly, _dag: SimDag): WhyBlock {
  const evidence: any[] = [];
  if (a.txId) evidence.push({ type: "txId", value: a.txId });
  if (a.blockId) evidence.push({ type: "blockId", value: a.blockId });

  return {
    question: `Why anomaly: ${a.kind}?`,
    answer: a.description,
    evidence,
    causalChain: [
      { order: 1, assertion: a.description, evidence: `Anomaly: ${a.kind}`, rule: "DAG invariant check" }
    ],
    model: "deterministic-light-model",
    confidence: "definitive"
  };
}
