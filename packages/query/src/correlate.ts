/**
 * Correlation Engine — cross-domain causal linking.
 *
 * Given an anchor (txId, contentHash), reconstructs a full
 * cross-domain view: lineage chain + DAG state + RPC state + replay.
 *
 * This is the "show me everything about this transaction" operation.
 */
import { readEvents } from "./events.js";
import { computeQueryHash } from "./serialize.js";
import type {
  QueryRequest,
  QueryResult,
  ExplainChain,
  ReasoningStep
} from "./types.js";
import type { QueryEngine } from "./engine.js";
import type { LineageChainResult, LineageNode } from "./types.js";
import type { DagTxHistory, DagConflict } from "./types.js";
import type { ReplaySummaryResult, ReplayInvariantsResult } from "./types.js";
import type { RpcCorrelation } from "./types.js";

// ---------------------------------------------------------------------------
// Correlation Types
// ---------------------------------------------------------------------------

export interface TimelineEvent {
  readonly ts: string;
  readonly domain: string;
  readonly kind: string;
  readonly summary: string;
}

export interface CorrelationBundle {
  readonly txId: string;
  readonly lineage?: {
    readonly chain: readonly { schema: string; contentHash: string }[];
    readonly transitionCount: number;
    readonly complete: boolean;
  } | undefined;
  readonly dag?: {
    readonly accepted: boolean;
    readonly displaced: boolean;
    readonly conflictCount: number;
    readonly inSinkPath: boolean;
    readonly blockId: string;
  } | undefined;
  readonly rpc?: {
    readonly endpoint: string;
    readonly scoreAtSubmission: number;
    readonly stateAtSubmission: string;
    readonly assessment: string;
    readonly errorCount: number;
  } | undefined;
  readonly replay?: {
    readonly found: boolean;
    readonly status: string;
    readonly invariantsOk: boolean;
    readonly issueCount: number;
  } | undefined;
  readonly timeline: readonly TimelineEvent[];
}

// ---------------------------------------------------------------------------
// Correlate
// ---------------------------------------------------------------------------

export async function correlate(
  txId: string,
  engine: QueryEngine,
  options: {
    include: string[];
    cwd: string;
    explain: "brief" | "full" | false;
  }
): Promise<QueryResult<CorrelationBundle>> {
  const start = Date.now();
  const { createQueryRequest } = await import("./engine.js");
  const timeline: TimelineEvent[] = [];

  let lineage: CorrelationBundle["lineage"];
  let dag: CorrelationBundle["dag"];
  let rpc: CorrelationBundle["rpc"];
  let replay: CorrelationBundle["replay"];

  // --- Lineage ---
  if (options.include.includes("lineage")) {
    try {
      const result = await engine.execute(createQueryRequest({
        domain: "lineage",
        op: "chain",
        params: { anchor: txId, direction: "ancestors" }
      }));
      const chain = result.items[0] as LineageChainResult | undefined;
      if (chain) {
        lineage = {
          chain: chain.nodes.map((n: LineageNode) => ({ schema: n.schema, contentHash: n.contentHash })),
          transitionCount: chain.transitions?.length ?? 0,
          complete: chain.complete
        };
        for (const node of chain.nodes) {
          timeline.push({
            ts: node.createdAt || "",
            domain: "lineage",
            kind: "artifact",
            summary: `${node.schema} [${node.contentHash?.slice(0, 12)}...]`
          });
        }
      }
    } catch { /* lineage not found */ }
  }

  // --- DAG ---
  if (options.include.includes("dag")) {
    try {
      const result = await engine.execute(createQueryRequest({
        domain: "dag",
        op: "history",
        params: { txId }
      }));
      if (result.total > 0) {
        const entry = result.items[0] as DagTxHistory;
        dag = {
          accepted: entry.accepted,
          displaced: entry.displaced,
          conflictCount: 0,
          inSinkPath: entry.inSinkPath,
          blockId: entry.blockId
        };
        timeline.push({
          ts: "",
          domain: "dag",
          kind: entry.accepted ? "accepted" : "displaced",
          summary: `DAG: ${entry.accepted ? "ACCEPTED" : "DISPLACED"} in ${entry.blockId} (daa:${entry.daaScore})`
        });
      }

      // Check conflicts
      const conflictResult = await engine.execute<DagConflict>(createQueryRequest({ domain: "dag", op: "conflicts" }));
      const relatedConflicts = conflictResult.items.filter(
        c => c.winnerTxId === txId || c.loserTxIds?.includes(txId)
      );
      if (dag && relatedConflicts.length > 0) {
        dag = { ...dag, conflictCount: relatedConflicts.length };
      }
    } catch { /* dag not found */ }
  }

  // --- Replay ---
  if (options.include.includes("replay")) {
    try {
      const summaryResult = await engine.execute(createQueryRequest({
        domain: "replay",
        op: "summary",
        params: { txId }
      }));
      const s = summaryResult.items[0] as ReplaySummaryResult | undefined;
      if (s) {
        timeline.push({
          ts: "",
          domain: "replay",
          kind: "receipt",
          summary: `Receipt: ${s.status} (${s.amountSompi} sompi, fee:${s.feeSompi})`
        });

        // Check invariants
        let invariantsOk = true;
        let issueCount = 0;
        try {
          const invResult = await engine.execute(createQueryRequest({
            domain: "replay",
            op: "invariants",
            params: { txId }
          }));
          const inv = invResult.items[0] as ReplayInvariantsResult | undefined;
          if (inv) {
            invariantsOk = inv.planIntegrity && inv.receiptReproducible && inv.stateTransitionValid && inv.utxoConservation;
            issueCount = inv.issues.length;
          }
        } catch { /* invariants check failed */ }

        replay = {
          found: true,
          status: s.status,
          invariantsOk,
          issueCount
        };
      }
    } catch {
      replay = { found: false, status: "not-found", invariantsOk: false, issueCount: 0 };
    }
  }

  // --- RPC ---
  if (options.include.includes("rpc")) {
    try {
      const result = await engine.execute(createQueryRequest({
        domain: "rpc",
        op: "correlate",
        params: { txId }
      }));
      const c = result.items[0] as RpcCorrelation | undefined;
      if (c) {
        rpc = {
          endpoint: c.endpoint,
          scoreAtSubmission: c.scoreAtSubmission,
          stateAtSubmission: c.stateAtSubmission,
          assessment: c.assessment,
          errorCount: c.nearbyErrors.length
        };
        timeline.push({
          ts: c.submittedAt,
          domain: "rpc",
          kind: "submission",
          summary: `RPC: submitted via ${c.endpoint} (score:${c.scoreAtSubmission}, ${c.assessment})`
        });
      }
    } catch { /* rpc not found */ }
  }

  // Sort timeline chronologically
  timeline.sort((a, b) => a.ts.localeCompare(b.ts));

  const bundle: CorrelationBundle = {
    txId,
    lineage,
    dag,
    rpc,
    replay,
    timeline
  };

  let explain: ExplainChain[] | undefined;
  if (options.explain) {
    explain = [buildCorrelationExplain(bundle)];
  }

  return {
    domain: "artifacts" as any, // correlation is cross-domain
    op: "correlate",
    items: [bundle],
    total: 1,
    truncated: false,
    deterministic: true,
    queryHash: computeQueryHash([bundle]),
    explain,
    annotations: {
      executedAt: new Date().toISOString(),
      executionMs: Date.now() - start
    }
  };
}

// ---------------------------------------------------------------------------
// Explain
// ---------------------------------------------------------------------------

function buildCorrelationExplain(bundle: CorrelationBundle): ExplainChain {
  const steps: ReasoningStep[] = [];
  let order = 1;

  if (bundle.lineage) {
    steps.push({
      order: order++,
      assertion: `Lineage: ${bundle.lineage.chain.length} artifact(s) in chain, ${bundle.lineage.complete ? "complete" : "incomplete"}`,
      evidence: bundle.lineage.chain.map(n => n.schema).join(" → "),
      rule: "Lineage chain traversal (lineage-adapter.ts)"
    });
  }

  if (bundle.dag) {
    steps.push({
      order: order++,
      assertion: `DAG: ${bundle.dag.accepted ? "ACCEPTED" : "DISPLACED"} in block ${bundle.dag.blockId}. ${bundle.dag.conflictCount} conflict(s).`,
      evidence: `inSinkPath=${bundle.dag.inSinkPath}`,
      rule: "DAG history query. Model: deterministic-light-model (NOT GHOSTDAG)"
    });
  }

  if (bundle.replay) {
    steps.push({
      order: order++,
      assertion: `Replay: status=${bundle.replay.status}, invariants=${bundle.replay.invariantsOk ? "PASS" : "FAIL"} (${bundle.replay.issueCount} issue(s))`,
      evidence: `Receipt found: ${bundle.replay.found}`,
      rule: "Replay invariant checking (replay-adapter.ts)"
    });
  }

  if (bundle.rpc) {
    steps.push({
      order: order++,
      assertion: `RPC: ${bundle.rpc.assessment} at submission. Score: ${bundle.rpc.scoreAtSubmission}/100. Errors: ${bundle.rpc.errorCount}.`,
      evidence: `Endpoint: ${bundle.rpc.endpoint}, state: ${bundle.rpc.stateAtSubmission}`,
      rule: "RPC confidence correlation (rpc-adapter.ts)"
    });
  }

  // Overall assessment
  const issues: string[] = [];
  if (bundle.dag?.displaced) issues.push("tx was DISPLACED in DAG");
  if (bundle.replay && !bundle.replay.invariantsOk) issues.push(`${bundle.replay.issueCount} replay invariant violation(s)`);
  if (bundle.rpc?.assessment === "risky") issues.push("RPC was RISKY at submission time");

  const conclusion = issues.length === 0
    ? `Transaction ${bundle.txId.slice(0, 16)}... appears healthy across all queried domains.`
    : `Transaction ${bundle.txId.slice(0, 16)}... has ${issues.length} concern(s): ${issues.join("; ")}.`;

  return {
    question: `What is the full operational status of tx ${bundle.txId.slice(0, 16)}...?`,
    conclusion,
    steps,
    model: "cross-domain-correlation",
    confidence: "definitive",
    references: [bundle.txId]
  };
}
