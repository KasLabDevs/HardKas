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
  WhyBlock,
  CausalStep
} from "../types.js";
import type { QueryBackend } from "../backend.js";

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class ReplayQueryAdapter implements QueryAdapter {
  readonly domain = "replay" as const;
  private readonly rootDir: string;
  private readonly backend: QueryBackend;

  constructor(rootDir: string, backend: QueryBackend) {
    this.rootDir = rootDir;
    this.backend = backend;
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
    const receipts = await this.backend.findReceipts({
      status: request.filters.find(f => f.field === "status")?.value as string
    });
    const traces = await this.backend.findTraces();
    const traceMap = new Map(traces.map(t => [t.txId!, t]));

    const items: ReplaySummaryResult[] = [];

    for (const r of receipts) {
      const trace = traceMap.get(r.txId!);
      const item = toSummary(r.payload, trace?.payload);
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

    const receipt = await this.backend.getArtifact(txId);
    if (!receipt || receipt.schema !== "hardkas.txReceipt") throw new Error(`Receipt not found for txId: ${txId}`);

    const traces = await this.backend.findTraces({ txId });
    const trace = traces[0];
    const item = toSummary(receipt.payload, trace?.payload);

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
    const receipts = await this.backend.findReceipts();
    const divergences: ReplayDivergence[] = [];

    for (const doc of receipts) {
      const receipt = doc.payload;
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

    let why: WhyBlock[] | undefined;
    if (request.explain) {
      why = paged.map(d => explainDivergence(d));
    }

    return {
      domain: "replay",
      op: "divergences",
      items: paged,
      total: divergences.length,
      truncated: divergences.length > request.offset + request.limit,
      deterministic: true,
      queryHash: computeQueryHash(paged),
      why,
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

    const doc = await this.backend.getArtifact(txId);
    if (!doc || doc.schema !== "hardkas.txReceipt") throw new Error(`Receipt not found for txId: ${txId}`);
    const receipt = doc.payload;

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

    let why: WhyBlock[] | undefined;
    if (request.explain) {
      why = [explainInvariants(result)];
    }

    return {
      domain: "replay",
      op: "invariants",
      items: [result],
      total: 1,
      truncated: false,
      deterministic: true,
      queryHash: computeQueryHash([result]),
      why,
      annotations: {
        executedAt: new Date().toISOString(),
        executionMs: Date.now() - start,
        filesScanned: 1
      }
    };
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

function explainDivergence(d: ReplayDivergence): WhyBlock {
  return {
    question: `Why is tx ${d.txId.slice(0, 16)}... divergent?`,
    answer: `Field "${d.field}" shows unexpected non-deterministic behavior (${d.kind}).`,
    evidence: [{ type: "txId", value: d.txId }],
    causalChain: [
      { 
        order: 1, 
        assertion: `Value mismatch in "${d.field}"`, 
        evidence: `Expected: ${d.expected.slice(0, 40)}, Actual: ${d.actual.slice(0, 40)}`,
        rule: DIVERGENCE_RULES[d.kind] 
      },
      { 
        order: 2, 
        assertion: "Divergence detected in replay comparison", 
        evidence: "Verification engine mismatch",
        rule: "Invariant validation policy" 
      }
    ],
    model: "replay-analysis",
    confidence: "definitive"
  };
}

function explainInvariants(result: ReplayInvariantsResult): WhyBlock {
  const causalChain: CausalStep[] = [];
  let order = 1;

  causalChain.push({ order: order++, assertion: result.planIntegrity ? "Plan integrity is OK" : "Plan integrity FAILED", evidence: `planIntegrity=${result.planIntegrity}`, rule: "SHA-256 canonical consistency" });
  causalChain.push({ order: order++, assertion: result.receiptReproducible ? "Receipt is reproducible" : "Receipt is NOT reproducible", evidence: `receiptReproducible=${result.receiptReproducible}`, rule: "Replay evidence requirements" });
  causalChain.push({ order: order++, assertion: result.stateTransitionValid ? "State transition is valid" : "State transition INVALID", evidence: `stateTransitionValid=${result.stateTransitionValid}`, rule: "Status/State alignment" });
  causalChain.push({ order: order++, assertion: result.utxoConservation ? "UTXO conservation holds" : "UTXO conservation VIOLATED", evidence: `utxoConservation=${result.utxoConservation}`, rule: "Value conservation policy" });

  const allOk = result.planIntegrity && result.receiptReproducible && result.stateTransitionValid && result.utxoConservation;

  return {
    question: `Are replay invariants satisfied for tx ${result.txId.slice(0, 16)}...?`,
    answer: allOk ? "All replay invariants satisfied." : `Violations found: ${result.issues.join("; ")}`,
    evidence: [{ type: "txId", value: result.txId }],
    causalChain,
    model: "replay-invariants",
    confidence: "definitive"
  };
}
