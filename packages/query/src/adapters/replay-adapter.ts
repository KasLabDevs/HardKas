/**
 * Replay Query Adapter.
 *
 * Provides: list, summary, divergences, invariants operations over stored
 * receipts and traces in the .hardkas/ directory.
 *
 * Source of truth: .hardkas/receipts/*.json + .hardkas/traces/*.trace.json
 *
 * ESCALÓN 2 · P9: `divergences` and `invariants` are STATIC ANALYSIS of the stored receipts: they read their fields and
 * re-execute nothing. Only `hardkas replay verify` replays (re-executes a plan and compares the receipt). Their results
 * and explanations say so, and never call a receipt "reproducible" or a check a "replay".
 */
import fs from "node:fs/promises";
import path from "node:path";
import { recomputeDeclaredContentHash, readDeclaredHashVersion, CURRENT_HASH_VERSION, planRelayMinimum } from "@hardkas/artifacts";
import type { TxId } from "@hardkas/core";
import { computeQueryHash } from "../serialize.js";
import { paginateAndFormatResult } from "../format.js";
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
import { deterministicCompare } from "@hardkas/core";

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
    return [
      "txId",
      "status",
      "networkId",
      "mode",
      "daaScore",
      "from.address",
      "to.address"
    ] as const;
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
      status: request.filters.find((f) => f.field === "status")?.value as string
    });
    const traces = await this.backend.findTraces();
    const traceMap = new Map(traces.map((t) => [t.txId!, t]));

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
      const cmp = deterministicCompare(b.daaScore, a.daaScore);
      return cmp !== 0 ? cmp : deterministicCompare(a.txId, b.txId);
    });

    return paginateAndFormatResult({
      request,
      items,
      domain: "replay",
      op: "list",
      deterministic: true,
      annotations: {
        executionMs: Date.now() - start,
        filesScanned: receipts.length + traces.length
      }
    });
  }

  // -------------------------------------------------------------------------
  // Summary — detailed summary for a specific txId
  // -------------------------------------------------------------------------

  private async executeSummary(request: QueryRequest): Promise<QueryResult> {
    const start = Date.now();
    const txId = request.params["txId"];
    if (!txId) throw new Error("summary requires params.txId");

    const receipt = await this.backend.getArtifact(txId);
    if (!receipt || receipt.schema !== "hardkas.txReceipt")
      throw new Error(`Receipt not found for txId: ${txId}`);

    const traces = await this.backend.findTraces({ txId });
    const trace = traces[0];
    const item = toSummary(receipt.payload, trace?.payload);

    return paginateAndFormatResult({
      request,
      items: [item],
      domain: "replay",
      op: "summary",
      deterministic: true,
      annotations: {
        executionMs: Date.now() - start,
        filesScanned: trace ? 2 : 1
      }
    });
  }

  // -------------------------------------------------------------------------
  // Divergences — detect receipts that show signs of non-determinism
  // -------------------------------------------------------------------------

  private async executeDivergences(request: QueryRequest): Promise<QueryResult> {
    const start = Date.now();
    const receipts = await this.backend.findReceipts();
    const divergences: ReplayDivergence[] = [];
    // the plans, read once and only when a receipt names its lineage root (the fee check below)
    let planIndex: Map<string, any> | undefined;
    const plans = async (): Promise<Map<string, any>> => {
      if (!planIndex) {
        planIndex = new Map();
        for (const doc of await this.backend.findArtifacts({ schema: "hardkas.txPlan" })) {
          if (doc.contentHash) planIndex.set(doc.contentHash, doc.payload);
        }
      }
      return planIndex;
    };

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

      // IC-2′.8 / IC-4′.4 (R-iii part 1): `status` is a decision input only when the
      // receipt's hash authenticates it (FULL). A legacy or unverifiable receipt gets
      // an explicit insufficient-evidence entry instead of a status-based verdict.
      const scope = authScopeOf(receipt);
      if (scope !== "FULL") {
        divergences.push({
          txId: receipt.txId,
          kind: "insufficient-evidence",
          field: "status",
          expected: `status authenticated by hashVersion ${CURRENT_HASH_VERSION}`,
          actual: describeUnauthenticated(receipt, scope)
        });
      }

      // 2. Pre/post state hash consistency
      if (
        scope === "FULL" &&
        receipt.preStateHash &&
        receipt.postStateHash &&
        receipt.preStateHash === receipt.postStateHash &&
        receipt.status === "confirmed"
      ) {
        divergences.push({
          txId: receipt.txId,
          kind: "state-hash-mismatch",
          field: "stateTransition",
          expected: "preStateHash !== postStateHash for confirmed tx",
          actual: `both are ${receipt.preStateHash}`
        });
      }

      // 3. Fee against the node's relay minimum (ESCALÓN 2 · P9). The former rule (`fee > 10 × mass`) flagged every
      // payment at the standard rate. The real rule is a floor: the node relays at MINIMUM_RELAY_FEE_RATE_SOMPI_PER_GRAM
      // (100 sompi) per gram of COMPUTE mass, and a fee above it buys priority. A receipt records only the overall mass
      // (a storage-bound payment records its storage mass, which has no relay floor), so the floor comes from the
      // receipt's plan (its lineage root), priced by the pinned SDK (@hardkas/artifacts `planRelayMinimum`). Without
      // that plan, or where it cannot be priced here, the fee is not judged.
      const fee = parseBigIntSafe(receipt.feeSompi);
      const root = receipt.lineage?.rootArtifactId;
      const relay = fee !== undefined && typeof root === "string" ? relayMinimumOf(await plans(), root) : undefined;
      if (fee !== undefined && relay && fee < relay.relayFeeSompi) {
        divergences.push({
          txId: receipt.txId,
          kind: "fee-mismatch",
          field: "feeSompi",
          expected: `at least the relay minimum of its plan: ${relay.relayFeeSompi} sompi (compute mass ${relay.computeMass})`,
          actual: `fee ${fee} sompi`
        });
      }

      // 4. UTXO count consistency
      const spentCount = receipt.spentUtxoIds?.length ?? 0;
      const createdCount = receipt.createdUtxoIds?.length ?? 0;
      if (scope === "FULL" && receipt.status === "confirmed" && spentCount === 0) {
        divergences.push({
          txId: receipt.txId,
          kind: "utxo-count-mismatch",
          field: "spentUtxoIds",
          expected: "at least 1 spent UTXO for confirmed tx",
          actual: `${spentCount} spent`
        });
      }

      // 5. Status/state consistency
      if (
        scope === "FULL" &&
        receipt.status === "failed" &&
        receipt.postStateHash &&
        receipt.postStateHash !== receipt.preStateHash
      ) {
        divergences.push({
          txId: receipt.txId,
          kind: "status-mismatch",
          field: "status",
          expected: "failed tx should not change state",
          actual: `state changed: ${receipt.preStateHash} → ${receipt.postStateHash}`
        });
      }
    }

    divergences.sort((a, b) => deterministicCompare(a.txId, b.txId));
    let why: WhyBlock[] | undefined;
    if (request.explain) {
      const pagedForWhy = divergences.slice(
        request.offset ?? 0,
        (request.offset ?? 0) + (request.limit ?? divergences.length)
      );
      why = pagedForWhy.map((d) => explainDivergence(d));
    }

    return paginateAndFormatResult({
      request,
      items: divergences,
      domain: "replay",
      op: "divergences",
      deterministic: true,
      why,
      annotations: {
        executionMs: Date.now() - start,
        filesScanned: receipts.length
      }
    });
  }

  // -------------------------------------------------------------------------
  // Invariants — check replay invariants for a specific txId
  // -------------------------------------------------------------------------

  private async executeInvariants(request: QueryRequest): Promise<QueryResult> {
    const start = Date.now();
    const txId = request.params["txId"];
    if (!txId) throw new Error("invariants requires params.txId");

    const doc = await this.backend.getArtifact(txId);
    if (!doc || doc.schema !== "hardkas.txReceipt")
      throw new Error(`Receipt not found for txId: ${txId}`);
    const receipt = doc.payload;

    const issues: string[] = [];

    // ESCALÓN 2 · P9: static checks of the receipt's own fields; nothing is re-executed (`hardkas replay verify` does
    // that). The fields say what each check looks at: the former names ("planIntegrity", "receiptReproducible",
    // "utxoConservation") claimed a plan check, a replay and a value conservation that none of them performs.

    // 1. The receipt's contentHash matches its recomputed hash
    const contentHashMatches = receipt.contentHash
      ? computeContentHashSafe(receipt) === receipt.contentHash
      : true;
    if (!contentHashMatches) {
      issues.push("Receipt contentHash does not match recomputed hash");
    }

    // 2. Pre/post state hashes are recorded (needed by a replay; their presence proves nothing by itself)
    const stateHashesPresent = !!(receipt.preStateHash && receipt.postStateHash);
    if (!stateHashesPresent) {
      issues.push("Missing pre/post state hashes: 'hardkas replay verify' has nothing to compare against");
    }

    // IC-2′.8 / IC-4′.4: status-based checks are evaluated only when the
    // receipt's hash authenticates its status. Otherwise they are NOT established
    // (fail closed) and the reason is stated.
    const authScope = authScopeOf(receipt);
    let stateChangeMatchesStatus = true;
    let utxoCountsNonZero = true;
    if (authScope !== "FULL") {
      stateChangeMatchesStatus = false;
      utxoCountsNonZero = false;
      issues.push(
        `Receipt status ${JSON.stringify(receipt.status)} is not authenticated (${describeUnauthenticated(receipt, authScope)}): the state-change and UTXO-count checks were not evaluated (IC-2′.8)`
      );
    } else {
      // 3. The recorded state change agrees with the status
      if (receipt.status === "confirmed") {
        if (receipt.preStateHash === receipt.postStateHash) {
          stateChangeMatchesStatus = false;
          issues.push("Confirmed tx did not change state (pre === post)");
        }
      } else if (receipt.status === "failed") {
        if (
          receipt.preStateHash &&
          receipt.postStateHash &&
          receipt.preStateHash !== receipt.postStateHash
        ) {
          stateChangeMatchesStatus = false;
          issues.push("Failed tx changed state (pre !== post)");
        }
      }

      // 4. A confirmed transaction lists spent and created UTXOs (counts only: no amount is summed)
      const spentCount = receipt.spentUtxoIds?.length ?? 0;
      const createdCount = receipt.createdUtxoIds?.length ?? 0;
      if (receipt.status === "confirmed") {
        if (spentCount === 0) {
          utxoCountsNonZero = false;
          issues.push("Confirmed tx spent 0 UTXOs");
        }
        if (createdCount === 0) {
          utxoCountsNonZero = false;
          issues.push("Confirmed tx created 0 UTXOs");
        }
      }
    }

    const result: ReplayInvariantsResult = {
      txId: txId as TxId,
      analysis: "static",
      authScope,
      contentHashMatches,
      stateHashesPresent,
      stateChangeMatchesStatus,
      utxoCountsNonZero,
      issues
    };

    let why: WhyBlock[] | undefined;
    if (request.explain) {
      why = [explainInvariants(result)];
    }

    return paginateAndFormatResult({
      request,
      items: [result],
      domain: "replay",
      op: "invariants",
      deterministic: true,
      why,
      annotations: {
        executionMs: Date.now() - start,
        filesScanned: 1
      }
    });
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

/** The relay minimum of the plan a receipt's lineage starts from, when that plan is here and can be priced. */
function relayMinimumOf(plans: Map<string, any>, root: string): { computeMass: bigint; relayFeeSompi: bigint } | undefined {
  const plan = plans.get(root);
  return plan ? planRelayMinimum(plan) : undefined;
}

function parseBigIntSafe(value: unknown): bigint | undefined {
  try {
    return typeof value === "string" || typeof value === "number" || typeof value === "bigint" ? BigInt(value) : undefined;
  } catch {
    return undefined;
  }
}

function computeContentHashSafe(obj: any): string {
  try {
    return recomputeDeclaredContentHash(obj);
  } catch {
    return "error-computing-hash";
  }
}

/**
 * What the receipt's content hash authenticated (Closure Pack D-Q1.e):
 * FULL only for a current-version receipt that hashes to its identity.
 */
function authScopeOf(receipt: any): "FULL" | "LEGACY" | "NONE" {
  const version = readDeclaredHashVersion(receipt);
  if (version === null) return "NONE";
  if (typeof receipt.contentHash !== "string" || computeContentHashSafe(receipt) !== receipt.contentHash) return "NONE";
  return version === CURRENT_HASH_VERSION ? "FULL" : "LEGACY";
}

function describeUnauthenticated(receipt: any, scope: "LEGACY" | "NONE" | "FULL"): string {
  if (scope === "LEGACY") return `hashVersion ${String(receipt.hashVersion)}: status not authenticated by that version`;
  return "identity not established (missing/invalid hashVersion or contentHash): status not authenticated";
}

// ---------------------------------------------------------------------------
// Explain
// ---------------------------------------------------------------------------

const DIVERGENCE_RULES: Record<DivergenceKind, string> = {
  "state-hash-mismatch":
    "The receipt's contentHash must match its recomputed hash, and a confirmed transaction records a state change (pre and post state hashes differ). Checked on the stored receipt only; nothing is re-executed.",
  "fee-mismatch":
    "A receipt pays at least the node's relay minimum: 100 sompi per gram of the compute mass of its plan's transaction (@hardkas/tx-builder MINIMUM_RELAY_FEE_RATE_SOMPI_PER_GRAM, measureRelayFee). A fee above it buys priority and is never a finding; without its plan the fee is not judged (the receipt records only the overall mass).",
  "utxo-count-mismatch":
    "Confirmed transactions must spend at least 1 UTXO (inputs) and create at least 1 (outputs).",
  "status-mismatch":
    "Failed transactions must not modify state. Confirmed transactions must modify state.",
  "txid-mismatch":
    "Deterministic txId generation: same plan + same state + same daaScore = same txId.",
  "ordering-divergence":
    "UTXO selection order must be deterministic.",
  "insufficient-evidence":
    "A status is a decision input only when the receipt's hash authenticates it (hashVersion 5). Legacy or unverifiable receipts yield no status-based verdict (IC-2′.8)."
};

function explainDivergence(d: ReplayDivergence): WhyBlock {
  return {
    question: `Why does static analysis flag tx ${d.txId.slice(0, 16)}...?`,
    answer: `Field "${d.field}" of the stored receipt fails a static check (${d.kind}). Nothing was re-executed: 'hardkas replay verify' replays the plan.`,
    evidence: [{ type: "txId", value: d.txId }],
    causalChain: [
      {
        order: 1,
        assertion: `Value mismatch in "${d.field}"`,
        evidence: `Expected: ${d.expected.slice(0, 80)}, Actual: ${d.actual.slice(0, 80)}`,
        rule: DIVERGENCE_RULES[d.kind]
      },
      {
        order: 2,
        assertion: "Found by static analysis of the stored receipt (no replay)",
        evidence: "The receipt's own fields",
        rule: "Static receipt checks"
      }
    ],
    model: "static-analysis",
    confidence: "definitive"
  };
}

function explainInvariants(result: ReplayInvariantsResult): WhyBlock {
  const causalChain: CausalStep[] = [];
  let order = 1;

  causalChain.push({
    order: order++,
    assertion: result.contentHashMatches ? "The receipt's contentHash matches" : "The receipt's contentHash does NOT match",
    evidence: `contentHashMatches=${result.contentHashMatches}`,
    rule: "SHA-256 canonical consistency"
  });
  causalChain.push({
    order: order++,
    assertion: result.stateHashesPresent
      ? "Pre and post state hashes are recorded (a replay could compare them; none was run)"
      : "Pre or post state hash is missing",
    evidence: `stateHashesPresent=${result.stateHashesPresent}`,
    rule: "Fields a replay needs"
  });
  causalChain.push({
    order: order++,
    assertion: result.stateChangeMatchesStatus
      ? "The recorded state change agrees with the status"
      : "The recorded state change contradicts the status",
    evidence: `stateChangeMatchesStatus=${result.stateChangeMatchesStatus}`,
    rule: "Status/State alignment"
  });
  causalChain.push({
    order: order++,
    assertion: result.utxoCountsNonZero
      ? "Spent and created UTXO lists are not empty"
      : "A spent or created UTXO list is empty",
    evidence: `utxoCountsNonZero=${result.utxoCountsNonZero}`,
    rule: "UTXO counts (no amount is summed)"
  });

  const allOk =
    result.contentHashMatches &&
    result.stateHashesPresent &&
    result.stateChangeMatchesStatus &&
    result.utxoCountsNonZero;

  return {
    question: `Do the static checks of tx ${result.txId.slice(0, 16)}...'s receipt pass?`,
    answer: allOk
      ? "All static checks pass (the receipt's fields only; nothing was re-executed)."
      : `Static checks failed: ${result.issues.join("; ")}`,
    evidence: [{ type: "txId", value: result.txId }],
    causalChain,
    model: "static-analysis",
    confidence: "definitive"
  };
}
