/**
 * Replay Query Adapter.
 *
 * Provides: list, summary, divergences, invariants operations over stored
 * receipts and traces in the .hardkas/ directory.
 *
 * Source of truth: .hardkas/receipts/*.json + .hardkas/traces/*.trace.json
 */
import fs from "node:fs/promises";
import path from "node:path";
import { calculateContentHash } from "@hardkas/artifacts";
import type { TxId } from "@hardkas/core";
import { computeQueryHash } from "../serialize.js";
import { evaluateFilters } from "../filter.js";
import type {
  QueryAdapter,
  QueryRequest,
  QueryResult,
  ReplaySummaryResult,
  ReplayDivergence,
  ReplayInvariantsResult,
  DivergenceKind,
  ExplainChain,
  ReasoningStep
} from "../types.js";

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class ReplayQueryAdapter implements QueryAdapter {
  readonly domain = "replay" as const;
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  supportedOps() {
    return ["list", "summary", "divergences", "invariants"] as const;
  }

  supportedFilters() {
    return ["txId", "status", "networkId", "mode", "daaScore", "from.address", "to.address"] as const;
  }

  async execute(request: QueryRequest): Promise<QueryResult> {
    switch (request.op) {
      case "list":
        return this.executeList(request);
      case "summary":
        return this.executeSummary(request);
      case "divergences":
        return this.executeDivergences(request);
      case "invariants":
        return this.executeInvariants(request);
      default:
        throw new Error(`Unknown replay op: ${request.op}`);
    }
  }

  // -------------------------------------------------------------------------
  // List — enumerate all stored receipts
  // -------------------------------------------------------------------------

  private async executeList(request: QueryRequest): Promise<QueryResult> {
    const start = Date.now();
    const receipts = await this.loadAllReceipts();
    const traces = await this.loadAllTraces();
    const traceMap = new Map(traces.map(t => [t.txId, t]));

    const items: ReplaySummaryResult[] = [];

    for (const r of receipts) {
      const trace = traceMap.get(r.txId);
      const item = toSummary(r, trace);
      if (evaluateFilters(item, request.filters)) {
        items.push(item);
      }
    }

    // Sort by daaScore desc, tie-break by txId
    items.sort((a, b) => {
      const cmp = b.daaScore.localeCompare(a.daaScore);
      return cmp !== 0 ? cmp : a.txId.localeCompare(b.txId);
    });

    const total = items.length;
    const paged = items.slice(request.offset, request.offset + request.limit);

    return {
      domain: "replay",
      op: "list",
      items: paged,
      total,
      truncated: total > request.offset + request.limit,
      deterministic: true,
      queryHash: computeQueryHash(paged),
      annotations: {
        executedAt: new Date().toISOString(),
        executionMs: Date.now() - start,
        filesScanned: receipts.length + traces.length
      }
    };
  }

  // -------------------------------------------------------------------------
  // Summary — detailed summary for a specific txId
  // -------------------------------------------------------------------------

  private async executeSummary(request: QueryRequest): Promise<QueryResult> {
    const start = Date.now();
    const txId = request.params["txId"];
    if (!txId) throw new Error("summary requires params.txId");

    const receipt = await this.loadReceipt(txId);
    if (!receipt) throw new Error(`Receipt not found for txId: ${txId}`);

    const trace = await this.loadTrace(txId);
    const item = toSummary(receipt, trace);

    return {
      domain: "replay",
      op: "summary",
      items: [item],
      total: 1,
      truncated: false,
      deterministic: true,
      queryHash: computeQueryHash([item]),
      annotations: {
        executedAt: new Date().toISOString(),
        executionMs: Date.now() - start,
        filesScanned: trace ? 2 : 1
      }
    };
  }

  // -------------------------------------------------------------------------
  // Divergences — detect receipts that show signs of non-determinism
  // -------------------------------------------------------------------------

  private async executeDivergences(request: QueryRequest): Promise<QueryResult> {
    const start = Date.now();
    const receipts = await this.loadAllReceipts();
    const divergences: ReplayDivergence[] = [];

    for (const receipt of receipts) {
      // Check for internal consistency issues that indicate divergence
      // 1. ContentHash mismatch (if present)
      if (receipt.contentHash) {
        const recomputed = computeContentHashSafe(receipt);
        if (recomputed !== receipt.contentHash) {
          divergences.push({
            txId: receipt.txId,
            kind: "state-hash-mismatch",
            field: "contentHash",
            expected: receipt.contentHash,
            actual: recomputed
          });
        }
      }

      // 2. Pre/post state hash consistency
      if (receipt.preStateHash && receipt.postStateHash && receipt.preStateHash === receipt.postStateHash && receipt.status === "confirmed") {
        divergences.push({
          txId: receipt.txId,
          kind: "state-hash-mismatch",
          field: "stateTransition",
          expected: "preStateHash !== postStateHash for confirmed tx",
          actual: `both are ${receipt.preStateHash}`
        });
      }

      // 3. Fee/mass consistency
      if (receipt.mass && receipt.feeSompi) {
        const mass = BigInt(receipt.mass);
        const fee = BigInt(receipt.feeSompi);
        if (mass > 0n && fee > 0n && fee > mass * 10n) {
          divergences.push({
            txId: receipt.txId,
            kind: "fee-mismatch",
            field: "feeSompi",
            expected: `fee proportional to mass (mass=${mass})`,
            actual: `fee=${fee} (ratio=${fee / mass})`
          });
        }
      }

      // 4. UTXO count consistency
      const spentCount = receipt.spentUtxoIds?.length ?? 0;
      const createdCount = receipt.createdUtxoIds?.length ?? 0;
      if (receipt.status === "confirmed" && spentCount === 0) {
        divergences.push({
          txId: receipt.txId,
          kind: "utxo-count-mismatch",
          field: "spentUtxoIds",
          expected: "at least 1 spent UTXO for confirmed tx",
          actual: `${spentCount} spent`
        });
      }

      // 5. Status/state consistency
      if (receipt.status === "failed" && receipt.postStateHash && receipt.postStateHash !== receipt.preStateHash) {
        divergences.push({
          txId: receipt.txId,
          kind: "status-mismatch",
          field: "status",
          expected: "failed tx should not change state",
          actual: `state changed: ${receipt.preStateHash} → ${receipt.postStateHash}`
        });
      }
    }

    divergences.sort((a, b) => a.txId.localeCompare(b.txId));
    const paged = divergences.slice(request.offset, request.offset + request.limit);

    let explain: ExplainChain[] | undefined;
    if (request.explain) {
      explain = paged.map(d => explainDivergence(d));
    }

    return {
      domain: "replay",
      op: "divergences",
      items: paged,
      total: divergences.length,
      truncated: divergences.length > request.offset + request.limit,
      deterministic: true,
      queryHash: computeQueryHash(paged),
      explain,
      annotations: {
        executedAt: new Date().toISOString(),
        executionMs: Date.now() - start,
        filesScanned: receipts.length
      }
    };
  }

  // -------------------------------------------------------------------------
  // Invariants — check replay invariants for a specific txId
  // -------------------------------------------------------------------------

  private async executeInvariants(request: QueryRequest): Promise<QueryResult> {
    const start = Date.now();
    const txId = request.params["txId"];
    if (!txId) throw new Error("invariants requires params.txId");

    const receipt = await this.loadReceipt(txId);
    if (!receipt) throw new Error(`Receipt not found for txId: ${txId}`);

    const issues: string[] = [];

    // 1. Plan integrity — contentHash should be stable
    const planIntegrity = receipt.contentHash
      ? computeContentHashSafe(receipt) === receipt.contentHash
      : true;
    if (!planIntegrity) {
      issues.push("Receipt contentHash does not match recomputed hash");
    }

    // 2. Receipt reproducibility — pre/post state hashes present
    const receiptReproducible = !!(receipt.preStateHash && receipt.postStateHash);
    if (!receiptReproducible) {
      issues.push("Missing pre/post state hashes — replay comparison not possible");
    }

    // 3. State transition validity
    let stateTransitionValid = true;
    if (receipt.status === "confirmed") {
      if (receipt.preStateHash === receipt.postStateHash) {
        stateTransitionValid = false;
        issues.push("Confirmed tx did not change state (pre === post)");
      }
    } else if (receipt.status === "failed") {
      if (receipt.preStateHash && receipt.postStateHash && receipt.preStateHash !== receipt.postStateHash) {
        stateTransitionValid = false;
        issues.push("Failed tx changed state (pre !== post)");
      }
    }

    // 4. UTXO conservation
    const spentCount = receipt.spentUtxoIds?.length ?? 0;
    const createdCount = receipt.createdUtxoIds?.length ?? 0;
    let utxoConservation = true;
    if (receipt.status === "confirmed") {
      if (spentCount === 0) {
        utxoConservation = false;
        issues.push("Confirmed tx spent 0 UTXOs");
      }
      if (createdCount === 0) {
        utxoConservation = false;
        issues.push("Confirmed tx created 0 UTXOs");
      }
    }

    const result: ReplayInvariantsResult = {
      txId: txId as TxId,
      planIntegrity,
      receiptReproducible,
      stateTransitionValid,
      utxoConservation,
      issues
    };

    let explain: ExplainChain[] | undefined;
    if (request.explain) {
      explain = [explainInvariants(result)];
    }

    return {
      domain: "replay",
      op: "invariants",
      items: [result],
      total: 1,
      truncated: false,
      deterministic: true,
      queryHash: computeQueryHash([result]),
      explain,
      annotations: {
        executedAt: new Date().toISOString(),
        executionMs: Date.now() - start,
        filesScanned: 1
      }
    };
  }

  // -------------------------------------------------------------------------
  // Filesystem
  // -------------------------------------------------------------------------

  private async loadAllReceipts(): Promise<any[]> {
    const dir = path.join(this.rootDir, ".hardkas", "receipts");
    return this.loadJsonDir(dir);
  }

  private async loadAllTraces(): Promise<any[]> {
    const dir = path.join(this.rootDir, ".hardkas", "traces");
    return this.loadJsonDir(dir);
  }

  private async loadReceipt(txId: string): Promise<any | null> {
    const filePath = path.join(this.rootDir, ".hardkas", "receipts", `${txId}.json`);
    return this.readJsonSafe(filePath);
  }

  private async loadTrace(txId: string): Promise<any | null> {
    const filePath = path.join(this.rootDir, ".hardkas", "traces", `${txId}.trace.json`);
    return this.readJsonSafe(filePath);
  }

  private async loadJsonDir(dir: string): Promise<any[]> {
    const results: any[] = [];
    let entries;
    try {
      entries = await fs.readdir(dir);
    } catch {
      return results;
    }

    for (const file of entries.sort()) {
      if (!file.endsWith(".json")) continue;
      const raw = await this.readJsonSafe(path.join(dir, file));
      if (raw) results.push(raw);
    }

    return results;
  }

  private async readJsonSafe(filePath: string): Promise<any | null> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

function toSummary(receipt: any, trace: any | null): ReplaySummaryResult {
  return {
    txId: receipt.txId || "unknown",
    status: receipt.status || "unknown",
    mode: receipt.mode || "unknown",
    networkId: receipt.networkId || "unknown",
    from: receipt.from?.address || "unknown",
    to: receipt.to?.address || "unknown",
    amountSompi: receipt.amountSompi || "0",
    feeSompi: receipt.feeSompi || "0",
    daaScore: receipt.daaScore || "0",
    preStateHash: receipt.preStateHash,
    postStateHash: receipt.postStateHash,
    spentUtxoCount: receipt.spentUtxoIds?.length ?? 0,
    createdUtxoCount: receipt.createdUtxoIds?.length ?? 0,
    hasTrace: !!trace,
    traceEventCount: trace?.events?.length ?? 0
  };
}

function computeContentHashSafe(obj: any): string {
  try {
    return calculateContentHash(obj);
  } catch {
    return "error-computing-hash";
  }
}

// ---------------------------------------------------------------------------
// Explain
// ---------------------------------------------------------------------------

const DIVERGENCE_RULES: Record<DivergenceKind, string> = {
  "state-hash-mismatch": "Deterministic replay invariant: identical plan + identical state = identical postStateHash",
  "fee-mismatch": "Fee must be proportional to estimated mass. Disproportionate fees indicate estimation drift.",
  "utxo-count-mismatch": "Confirmed transactions must spend at least 1 UTXO (inputs) and create at least 1 (outputs).",
  "status-mismatch": "Failed transactions must not modify state. Confirmed transactions must modify state.",
  "txid-mismatch": "Deterministic txId generation: same plan + same state + same daaScore = same txId.",
  "ordering-divergence": "UTXO selection order must be deterministic. Non-deterministic ordering breaks replay invariants."
};

function explainDivergence(d: ReplayDivergence): ExplainChain {
  return {
    question: `Why is tx ${d.txId.slice(0, 16)}... flagged as divergent?`,
    conclusion: `Divergence type: ${d.kind}. Field "${d.field}" expected ${d.expected.slice(0, 40)}${d.expected.length > 40 ? "..." : ""}, got ${d.actual.slice(0, 40)}${d.actual.length > 40 ? "..." : ""}.`,
    steps: [
      { order: 1, assertion: `Field "${d.field}" does not match expected value`, evidence: `expected: ${d.expected}, actual: ${d.actual}`, rule: DIVERGENCE_RULES[d.kind] },
      { order: 2, assertion: `Classified as ${d.kind}`, evidence: `Divergence category based on field and semantic context`, rule: "Replay divergence classification (query/replay-adapter.ts)" }
    ],
    model: "replay-invariants",
    confidence: "definitive",
    references: [d.txId]
  };
}

function explainInvariants(result: ReplayInvariantsResult): ExplainChain {
  const steps: ReasoningStep[] = [];
  let order = 1;

  steps.push({ order: order++, assertion: result.planIntegrity ? "Plan contentHash is stable" : "Plan contentHash MISMATCH", evidence: `planIntegrity=${result.planIntegrity}`, rule: "canonicalStringify + SHA-256 determinism" });
  steps.push({ order: order++, assertion: result.receiptReproducible ? "Receipt has pre/post state hashes for comparison" : "Receipt missing state hashes — replay comparison not possible", evidence: `receiptReproducible=${result.receiptReproducible}`, rule: "preStateHash + postStateHash required for replay verification" });
  steps.push({ order: order++, assertion: result.stateTransitionValid ? "State transition is consistent with status" : "State transition INCONSISTENT with status", evidence: `stateTransitionValid=${result.stateTransitionValid}`, rule: "Confirmed tx must change state. Failed tx must not." });
  steps.push({ order: order++, assertion: result.utxoConservation ? "UTXO conservation holds" : "UTXO conservation VIOLATION", evidence: `utxoConservation=${result.utxoConservation}`, rule: "Confirmed tx must consume and produce UTXOs" });

  const allOk = result.planIntegrity && result.receiptReproducible && result.stateTransitionValid && result.utxoConservation;

  return {
    question: `Are replay invariants satisfied for tx ${result.txId.slice(0, 16)}...?`,
    conclusion: allOk ? "All replay invariants satisfied." : `Invariant violations: ${result.issues.join("; ")}`,
    steps,
    model: "replay-invariants",
    confidence: "definitive",
    references: [result.txId]
  };
}
