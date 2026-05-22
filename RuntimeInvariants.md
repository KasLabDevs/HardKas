# HardKAS Runtime Invariants

This document outlines the strict invariant rules guaranteeing state consistency and causal traceability throughout the HardKAS deterministic runtime.

## 1. Event Ordering & Causality
The event log must respect causality without relying on external system clocks.
- **`correlationId`**: Groups all state transitions belonging to a single logical execution cycle.
- **`sequenceNumber`**: Strictly orders events within the same `correlationId`. It is a zero-indexed integer.
- **`globalOffset`**: A strictly monotonic integer representing the global chronological order of the event across the entire system log.

## 2. Deduplication Tuple Rules
To ensure idempotency in the `query-store` indexer, events are deduplicated using the following unique compound key:
- `(correlationId, sequenceNumber, eventType)`
- If a retry or recovery process emits a new phase of the same logical transaction, it must advance its `sequenceNumber` or use a different `eventType` to avoid being dropped.

## 3. Stale State Computable Invariants
Dashboard and UI staleness are never based on heuristics. They are strictly computable invariants:
- **Missing Replay**: `status === "confirmed" && !hasReplayReport`
- **Replay Divergence**: `replayStatus === "FAIL"`
- **Stale Replay Timestamp**: `sourceTimestamp > lastReplayTimestamp`
These rules ensure that the state displayed to operators is always cryptographically backed by an up-to-date execution replay.

## 4. Strict Doctor Failure Rules
Running `hardkas doctor --consistency --strict` evaluates absolute invariants. It fails **only** if:
- **Hash Mismatches**: An artifact's content hash does not match its expected integrity signature.
- **Orphan Lineage**: An artifact refers to a parent that does not exist in the filesystem.
- **Invalid JSON**: An indexed artifact is malformed or unreadable.
- **Circular Dependencies**: The causal graph of artifacts forms a loop.
- **Cross-Network Parentage**: Lineage spans across fundamentally incompatible network roots.

Minor liveness or UX issues (like missing configuration, external node unreachability, or missing consensus proofs) are treated as warnings and are explicitly ignored by the strict failure criteria.

## 5. Snapshot Replay Rules
Snapshots provide local deterministic reproducibility.
- **Manifest Integrity**: Every snapshot must possess a `manifest.json` defining its deterministic scope.
- **No Blind Trust**: When a snapshot is verified or restored, its packaged `store.db` (SQLite) is treated as a cache. The `runReplayVerify` pipeline operates directly against the bundled filesystem artifacts to recreate and validate the SQLite state.
- **Consensus Independence**: Snapshots do not guarantee network finality. They simply capture a local-first slice of the filesystem's historical truth.
