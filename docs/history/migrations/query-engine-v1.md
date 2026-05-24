# RFC: HardKas Query Engine v1

## 1. Problem Statement
The HardKas query system currently suffers from an **architectural fracture**. While the CLI has acceptable command coverage and the `QueryStore` (based on SQLite) is well-designed, the two worlds are disconnected.
- The **Query Engine** operates mostly through recursive file system scans, which degrades performance as the workspace grows.
- Formal artifact **Lineage** exists but is consumed inconsistently across different runners.
- **DAG and Replay** tools operate as isolated islands (light-model/research) without a common data interface.
- There is a lack of a **stable API** to build a Web UI or external auditing tools.
- There is no **single JSON envelope** providing execution metadata (Explain/Why) alongside results.

**Critical Mandate:** The goal of Query Engine v1 is not to "add more commands", but to consolidate a **coherent introspection layer** that serves as the observability backbone for HardKas.

## 2. Goals
- **Store-first Architecture**: Use `QueryStore` (SQLite) as the primary backend for all queries.
- **Explain Mode**: Provide full transparency on how a query was resolved (indexes, filters, backend).
- **Why Mode (Causality)**: Answer *why* an object is in a certain state based on evidence and lineage.
- **DAG Graph API**: Expose the DAG simulation graph through a structured API (explicitly marked as *research model*).
- **Replay Graph**: Unify the `txPlan -> signedTx -> receipt -> trace` flow into a searchable execution graph.
- **Event Sourcing**: Model state changes as a local indexed event log.
- **Web UI API**: Provide a stable data interface (Read-only) for future visual tools.
- **Unified JSON Envelope**: Guarantee a consistent response structure for CLI and API.

## 3. Non-Goals
- Do not implement real GHOSTDAG consensus validation (HardKas is not a network node).
- Do not replace direct `kaspad` RPC calls for live network states.
- Do not be a general-purpose block explorer for Mainnet.
- Do not expose raw SQL (RAW SQL) as a mutable public API.
- Do not guarantee institutional-grade security for query data custody.
- Do not optimize for "Mainnet Indexer" scales (goal: local workstation scale).

## 4. Current State Summary

| Area | Current State | Gap |
| :--- | :--- | :--- |
| **CLI Commands** | Broad command surface | Backend inconsistency; mixes business logic with file scanning. |
| **QueryStore** | High-quality SQLite schema | **Disconnected**; the engine does not use it for hot searches. |
| **Artifacts** | Canonical Zod schemas | Identity determinism is partial (affected by `createdAt`). |
| **Lineage** | Formal parent/child model | Many runners still use legacy fields like `sourcePlanId`. |
| **DAG** | Light simulation model | Needs a clear boundary between "debug simulation" and "network reality". |
| **Events** | Basic logging system | Lacks an *Event Sourcing* envelope to reconstruct timelines. |
| **Web UI** | Non-existent | No stable API for a UI to consume data efficiently. |

## 5. Architecture Principles
1. **Store-first, scan fallback**: Queries always attempt to use the SQLite index; disk is only used if the index is missing or corrupt.
2. **Explain everything**: Every response must be able to explain its origin and execution cost.
3. **Causality (Why)**: "Why" means tracing the causal path of events and lineage, not just showing debug text.
4. **Graphs as first-class**: Lineage, DAG, and replay are treated as graphs (nodes and edges), not just file lists.
5. **Stable JSON Envelope**: Response structure is sacred and must be identical for CLI and API.
6. **Redaction by default**: The query layer must filter secrets before any output.

## 6. Query Engine v1 Architecture

```text
Artifact Files / Events / Localnet State
        ↓
Indexer (Sync Logic)
        ↓
QueryStore SQLite (Persistence)
        ↓
QueryEngine Core (Coordination)
        ↓
Domain Adapters
  [Artifacts] [Lineage] [Replay] [DAG] [Events] [TX 360]
        ↓
Output Adapters
  [CLI Text] [JSON Envelope] [Web UI API]
```

The **Indexer** must be an explicit and verifiable process. The query engine must always report on index "Freshness".

## 7. Unified JSON Result Envelope v1
All queries will return a unified structure:

```typescript
type QueryResult<T> = {
  ok: boolean;
  apiVersion: "1.0.0";
  query: {
    domain: "artifacts" | "tx" | "dag" | "events";
    op: string;
    filters: Record<string, unknown>;
    mode: "default" | "explain" | "why";
  };
  data: T;
  graph?: QueryGraph; // Optional, for responses with topology
  explain?: ExplainBlock;
  why?: WhyBlock;
  warnings: QueryWarning[];
  diagnostics: {
    backend: "sqlite" | "filesystem-fallback";
    indexFreshness: "fresh" | "stale" | "unknown";
    executionMs: number;
    scannedFiles: number;
    rowsRead: number;
  };
};
```

## 8. Explain Mode
The `explain` mode must answer:
- Which backend was actually used (SQLite vs Disk)?
- Which filters were applied at the database level?
- How many records were read and how many files were scanned?
- Optimization suggestions (e.g., "Run 'hardkas query store rebuild' for better performance").

## 9. Why Mode (Causality)
Provides a chain of evidence explaining a state.
```typescript
type WhyBlock = {
  question: string;
  answer: string;
  evidence: {
    type: "artifact" | "event" | "block" | "code";
    id: string;
    ref: string; // Link to file or record
  }[];
  causalChain: {
    step: string;
    description: string;
    timestamp: string;
  }[];
};
```
*Example: "Why is this artifact an orphan?" -> Answer: "Parent with hash X not found; causal chain shows a branch checkout that deleted the original file."*

## 10. Artifact Query v1
- **Discovery**: Search by `txId`, `contentHash`, `schema`, or `network`.
- **Lineage**: Bi-directional navigation (parents and descendants).
- **Diff**: Structural comparison between two artifact states.

## 11. Lineage Graph v1
Lineage is exposed as a formal graph:
- **Nodes**: Artifacts.
- **Edges**: `parentArtifactId` (formal) or `sourcePlanId` (legacy) relationships.
- **Annotations**: Detection of cycles, orphans, and broken branches.

## 12. Replay Graph v1
Joins a transaction's lifecycle:
`txPlan` → `signedTx` → `txReceipt` → `replayTrace` → `DAG Context`.
Allows visualization of where a divergence occurred (e.g., "Divergence found at Step 3: Local state != Node state").

## 13. DAG Graph API v1 (Research Model)
- **Status**: Explicitly marked as `light-model`.
- **Data**: Simulated blocks, transaction inclusions, and conflict edges.
- **Warnings**: Must include `consensusLimitations` explaining it is a debug simulation and not real consensus.

## 14. Event Sourcing Model v1
HardKas will generate a persistent event log to reconstruct the developer timeline:
- `artifact.created`
- `tx.sent`
- `replay.diverged`
- `dag.displaced`
- `l2.tx.built`
- `bridge.assumption.reported`

## 15. TX Aggregation v1 (360 View)
The `hardkas query tx <txId>` command becomes the definitive view aggregating:
1. All related artifacts.
2. Event timeline.
3. Replay graph.
4. DAG position annotations.
5. Security warnings (Mainnet, Replay risks).

## 16. Web UI API v1
Conceptual contract (Read-only):
- `GET /api/query/artifacts`: Paginated listing with filters.
- `GET /api/query/tx/:txId`: 360 view of the transaction.
- `GET /api/query/lineage/:id`: Lineage graph.
- `GET /api/query/events`: Workspace event stream.

## 17. Store Freshness & Indexing
- **Auto-Sync**: The engine attempts to sync new files upon detecting mtime changes in the `.hardkas/` directory.
- **Doctor**: Command to detect inconsistencies between SQLite and the file system.
- **Zombie Cleanup**: Removal of records pointing to deleted files.

## 18. Security & Safety
- **Read-only by default**: Query API does not allow data mutations.
- **Path Traversal Protection**: Strict file path validation.
- **Secret Redaction**: Automatic filtering of `privateKey` and `mnemonic` fields before JSON serialization.

## 19. Migration Plan
1. **Phase 1 (Wiring)**: Connect `QueryEngine` with `SqliteQueryBackend`. Maintain disk scan as fallback.
2. **Phase 2 (Unified Envelope)**: Implement the `QueryResult` JSON in all CLI commands.
3. **Phase 3 (Graph APIs)**: Implement domain adapters for Lineage and Replay.
4. **Phase 4 (Explain/Why)**: Add inference and evidence reporting logic.
5. **Phase 5 (API/Web)**: Expose service layer for external tools.

## 20. Final Recommendation
The **Query Engine v1** should be treated as the **observability backbone** of HardKas. It is not a secondary feature; it is what turns a collection of JSON files into an auditable, reproducible, and professional system for Kaspa development.

---
### Design Checklist
- [x] Explain mode defined.
- [x] Why mode (causality) designed.
- [x] DAG Graph API (Research) clarified.
- [x] Replay graph integrated.
- [x] Local Event Sourcing modeled.
- [x] Web UI API conceptualized.
- [x] No code implementation (documentary RFC).
