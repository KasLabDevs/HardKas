/**
 * @hardkas/query — Core types for the HardKAS query and introspection engine.
 *
 * All query operations are deterministic pure functions over immutable artifact data.
 * Non-deterministic metadata (timestamps, execution time) is isolated in `annotations`.
 */
import {
  ArtifactId,
  TxId,
  KaspaAddress,
  LineageId,
  NetworkId,
  ContentHash,
  DaaScore
} from "@hardkas/core";

// ---------------------------------------------------------------------------
// Query Engine Configuration Types
// ---------------------------------------------------------------------------

export type QueryBackendMode = "auto" | "sqlite" | "filesystem";

export interface QueryBackendSelection {
  readonly requested: QueryBackendMode;
  readonly selected: "sqlite" | "filesystem";
  readonly fallback?: {
    readonly code: "SQLITE_INITIALIZATION_FAILED" | "SQLITE_MISSING";
    readonly causeName: string;
  };
}

// ---------------------------------------------------------------------------
// Query Domains & Operations
// ---------------------------------------------------------------------------

/** Query domains available. */
export type QueryDomain = "artifacts" | "lineage" | "replay" | "dag" | "events" | "tx";

/** Operations supported by the artifact adapter. */
export type ArtifactOp = "list" | "inspect" | "diff" | "verify";

/** Operations supported by the lineage adapter. */
export type LineageOp = "chain" | "transitions" | "orphans";

/** Operations supported by the replay adapter. */
export type ReplayOp = "list" | "summary" | "divergences" | "invariants";

/** Operations supported by the DAG adapter. */
export type DagOp = "conflicts" | "displaced" | "history" | "sink-path" | "anomalies";

/** Operations supported by the events adapter. */
export type EventsOp = "list" | "summary";

/** Operations supported by the transaction aggregator. */
export type TxOp = "aggregate";

// ---------------------------------------------------------------------------
// Filter Model
// ---------------------------------------------------------------------------

export type FilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "in"
  | "contains"
  | "exists";

export interface QueryFilter {
  readonly field: string; // dot-path: "from.address", "lineage.sequence"
  readonly op: FilterOp;
  readonly value: string | number | boolean | readonly string[];
}

// ---------------------------------------------------------------------------
// Sort Model
// ---------------------------------------------------------------------------

export interface QuerySort {
  readonly field: string;
  readonly direction: "asc" | "desc";
}

// ---------------------------------------------------------------------------
// Query Request
// ---------------------------------------------------------------------------

export interface QueryRequest {
  readonly domain: QueryDomain;
  readonly op: string;
  readonly filters: readonly QueryFilter[];
  readonly sort?: QuerySort | undefined;
  readonly limit: number;
  readonly offset: number;
  readonly explain: "brief" | "full" | false;
  readonly params: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Query Result — deterministic, self-describing
// ---------------------------------------------------------------------------

export interface QueryResult<T = unknown> {
  readonly domain: QueryDomain;
  readonly op: string;
  readonly items: readonly T[];
  readonly total: number;
  readonly truncated: boolean;
  readonly deterministic: boolean;
  readonly queryHash: string;
  readonly resultHash?: string | undefined;
  readonly annotations: QueryAnnotations;
  readonly explain?: ExplainBlock | undefined;
  readonly why?: readonly WhyBlock[] | undefined;
}

export type QueryStoreStatus = "fresh" | "stale" | "rebuilding" | "unknown";

/** Non-deterministic metadata, always isolated from deterministic fields. */
export interface QueryAnnotations {
  readonly executedAt: string;
  readonly executionMs: number;
  readonly filesScanned?: number | undefined;
  readonly backendUsed?: string | undefined;
  readonly freshness?: QueryStoreStatus | undefined;
}

// ---------------------------------------------------------------------------
// Explain & Why Engine Types
// ---------------------------------------------------------------------------

export interface ExplainBlock {
  readonly backend: string;
  readonly executionPlan: readonly string[];
  readonly indexesUsed: readonly string[];
  readonly filtersApplied: readonly string[];
  readonly rowsRead: number;
  readonly scannedFiles: number;
  readonly freshness: QueryStoreStatus;
  readonly warnings: readonly string[];
}

export interface WhyBlock {
  readonly question: string;
  readonly answer: string;
  readonly evidence: readonly EvidenceRef[];
  readonly causalChain: readonly CausalStep[];
  readonly model?: string;
  readonly confidence?: "definitive" | "probable";
}

export interface EvidenceRef {
  readonly type:
    | "artifactId"
    | "contentHash"
    | "txId"
    | "traceId"
    | "eventId"
    | "blockId"
    | "filePath";
  readonly value: string;
}

export interface CausalStep {
  readonly order: number;
  readonly assertion: string;
  readonly evidence: string;
  readonly rule?: string | undefined;
}

// ---------------------------------------------------------------------------
// Adapter Interface
// ---------------------------------------------------------------------------

export interface QueryAdapter<T = unknown> {
  readonly domain: QueryDomain;
  execute(request: QueryRequest): Promise<QueryResult<T>>;
  supportedOps(): readonly string[];
  supportedFilters(): readonly string[];
}

// ---------------------------------------------------------------------------
// Artifact Query Item
// ---------------------------------------------------------------------------

export interface ArtifactQueryItem {
  readonly filePath: string;
  readonly schema: string;
  readonly version: string;
  readonly networkId: NetworkId;
  readonly mode: string;
  readonly createdAt: string | null;
  readonly payload: any;
  readonly contentHash?: ContentHash | undefined;
  readonly from?: { readonly address: KaspaAddress } | undefined;
  readonly to?: { readonly address: KaspaAddress } | undefined;
  readonly amountSompi?: string | undefined;
  readonly status?: string | undefined;
  readonly lineage?:
    | {
        readonly artifactId: ArtifactId;
        readonly parentArtifactId?: ArtifactId | undefined;
        readonly rootArtifactId: ArtifactId;
        readonly lineageId: LineageId;
        readonly sequence?: number | undefined;
      }
    | undefined;
}

// ---------------------------------------------------------------------------
// Artifact Inspect Result
// ---------------------------------------------------------------------------

export interface ArtifactInspectResult {
  readonly item: ArtifactQueryItem;
  readonly integrity: {
    readonly ok: boolean;
    readonly hashMatch: boolean;
    readonly schemaValid: boolean;
    readonly errors: readonly string[];
  };
  readonly economics?:
    | {
        readonly ok: boolean;
        readonly massReported: string;
        readonly massRecomputed: string;
        readonly feeReported: string;
        readonly feeRecomputed: string;
        readonly feeRate: string;
      }
    | undefined;
  readonly staleness: {
    readonly ageHours: number;
    readonly stale: boolean;
    readonly classification: "fresh" | "aging" | "stale" | "expired";
  };
  /**
   * valid: the structure holds AND the parent was resolved in the workspace store (or it is a root) · orphan: the
   * structure is broken or the parent is missing/invalid · missing: no lineage block (EVIDENCE-TRUST-1: the same answer
   * `hardkas verify` gives).
   */
  readonly lineageStatus: "valid" | "orphan" | "missing" | "unknown";
  /** EVIDENCE-TRUST-1: what looking the parent up in the workspace store found. */
  readonly parent?: {
    readonly status: "resolved" | "missing" | "invalid" | "unresolved" | "root";
    readonly artifactId?: string;
    readonly detail?: string;
  };
}

// ---------------------------------------------------------------------------
// Artifact Diff Result
// ---------------------------------------------------------------------------

export interface ArtifactDiffEntry {
  /** The path of the difference (`lineage.parentArtifactId`, `inputs[0].amountSompi`). */
  readonly field: string;
  /** JSON of the left value (absent for an addition, and for a secret field). */
  readonly left: string | undefined;
  /** JSON of the right value (absent for a removal, and for a secret field). */
  readonly right: string | undefined;
  readonly kind: "value-change" | "added" | "removed" | "type-change";
  /** EVIDENCE-TRUST-1: whether the field is inside what the content hash covers (on either side). */
  readonly authenticated: boolean;
  /** A field named as a secret differs: its values are never shown, only that it differs. */
  readonly secret?: true;
  /** The values shown had URL credentials redacted (the raw values were compared). */
  readonly redacted?: true;
}

export interface ArtifactDiffResult {
  readonly leftPath: string;
  readonly rightPath: string;
  readonly leftSchema: string;
  readonly rightSchema: string;
  /** EVIDENCE-TRUST-1: nothing differs, every field compared on its raw value (identity fields and lineage included). */
  readonly identical: boolean;
  /** The two recomputed identities (content hashes under each declared hash version) are the same. */
  readonly sameIdentity: boolean;
  /** Each side's recomputed identity, or null when it cannot be established (no valid hashVersion). */
  readonly leftIdentity: string | null;
  readonly rightIdentity: string | null;
  readonly entries: readonly ArtifactDiffEntry[];
}

// ---------------------------------------------------------------------------
// Lineage Types
// ---------------------------------------------------------------------------

export interface LineageNode {
  readonly contentHash: ContentHash;
  readonly schema: string;
  readonly artifactId: ArtifactId;
  readonly parentArtifactId?: ArtifactId | undefined;
  readonly rootArtifactId: ArtifactId;
  readonly lineageId: LineageId;
  readonly sequence?: number | undefined;
  readonly filePath: string;
  readonly networkId: NetworkId;
  readonly mode: string;
  readonly createdAt: string | null;
  readonly workflowId?: string | undefined;
}

export interface LineageTransition {
  readonly from: LineageNode;
  readonly to: LineageNode;
  readonly valid: boolean;
  readonly rule: string;
}

export interface LineageChainResult {
  readonly anchor: string;
  readonly direction: "ancestors" | "descendants";
  readonly nodes: readonly LineageNode[];
  readonly transitions: readonly LineageTransition[];
  readonly complete: boolean;
}

export interface LineageOrphan {
  readonly node: LineageNode;
  readonly missingParentId: string;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Replay Types
// ---------------------------------------------------------------------------

export type DivergenceKind =
  | "state-hash-mismatch"
  | "fee-mismatch"
  | "utxo-count-mismatch"
  | "status-mismatch"
  | "txid-mismatch"
  | "ordering-divergence"
  /** IC-2′.8 / IC-4′.4: the receipt's status is not authenticated, so no status-based judgement was made. */
  | "insufficient-evidence";

export interface ReplayDivergence {
  readonly txId: string;
  readonly kind: DivergenceKind;
  readonly field: string;
  readonly expected: string;
  readonly actual: string;
}

export interface ReplaySummaryResult {
  readonly txId: TxId;
  readonly status: string;
  readonly mode: string;
  readonly networkId: NetworkId;
  readonly from: KaspaAddress;
  readonly to: KaspaAddress;
  readonly amountSompi: string;
  readonly feeSompi: string;
  readonly daaScore: string;
  readonly preStateHash?: string | undefined;
  readonly postStateHash?: string | undefined;
  readonly spentUtxoCount: number;
  readonly createdUtxoCount: number;
  readonly hasTrace: boolean;
  readonly traceEventCount: number;
}

export interface ReplayInvariantsResult {
  readonly txId: TxId;
  /** What the receipt's hash authenticated; status-based invariants are evaluated only for FULL. */
  readonly authScope: "FULL" | "LEGACY" | "NONE";
  readonly planIntegrity: boolean;
  readonly receiptReproducible: boolean;
  readonly stateTransitionValid: boolean;
  readonly utxoConservation: boolean;
  readonly issues: readonly string[];
}

// ---------------------------------------------------------------------------
// DAG Types
// ---------------------------------------------------------------------------

export interface DagConflict {
  readonly outpoint: string;
  readonly winnerTxId: TxId;
  readonly loserTxIds: readonly TxId[];
}

export interface DagDisplacement {
  readonly txId: TxId;
  readonly reason: string;
  readonly currentlyAccepted: boolean;
}

export interface DagTxHistory {
  readonly txId: TxId;
  readonly blockId: string;
  readonly accepted: boolean;
  readonly displaced: boolean;
  readonly inSinkPath: boolean;
  readonly daaScore: string;
}

export interface DagSinkPath {
  readonly nodes: readonly DagSinkPathNode[];
  readonly sink: string;
  readonly depth: number;
}

export interface DagSinkPathNode {
  readonly blockId: string;
  readonly daaScore: string;
  readonly acceptedTxCount: number;
  readonly isGenesis: boolean;
}

export interface DagAnomaly {
  readonly kind:
    | "displaced-never-reaccepted"
    | "unreachable-block"
    | "invariant-violation";
  readonly description: string;
  readonly txId?: string | undefined;
  readonly blockId?: string | undefined;
}
