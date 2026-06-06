# HardKAS Formal Runtime Contract

This document formally defines the operational semantics, guarantees, and failure modes of the HardKAS runtime (v0.8.20-alpha+). This is not a "best effort" guide; it is the strict operational contract that the runtime must uphold.

## 1. Authority Hierarchy & Artifact Identity

HardKAS distinguishes between authoritative truth and observational projections. The filesystem is the sole source of truth.

- **Canonical Filesystem Artifacts**: The ultimate authority. Artifact files (`artifacts/`) represent the immutable, hash-addressed source of truth for the workspace.
- **Event Ledger (`events.jsonl`)**: The canonical history of mutations. It is an append-only stream of `EventEnvelope`s with causality tracking. It is **never rotated**.
- **Telemetry Stream (`telemetry.jsonl`)**: Purely observational. Contains anomalies, metrics, and logs. It is **rotatable** and loss of telemetry does not invalidate canonical state.
- **SQLite Projection (query-store)**: A disposable, derived index. It is **never authoritative**. If lost, corrupt, or stale, it must be rebuilt from the event ledger and artifacts.
- **Dashboard Status**: Purely observational, derived from the watcher's reconciliation loop.

## 1.1 Zero-Trust Artifact Validation
The SDK strictly enforces zero-trust artifact verification. Any artifact loaded into memory from an external source or created locally must be verified mathematically before consumption (`simulate`, `send`, `verify`).
- `contentHash` is verified dynamically by recalculating the deterministic payload hash and comparing it strictly against the self-declared field.
- The SDK **never** trusts self-declared metadata. If a tampered object is passed, it is rejected instantly. It does **not** rely on cache hits or canonical IDs to bypass memory validation.

## 2. Determinism & Workflow Identity

Workflow Execution IDs (`workflowId`) are strictly deterministic cryptographic hashes, eliminating reliance on ambient time (`Date.now()`) or random placeholders.

### Strict Data Determinism
To guarantee byte-identical outputs across operating systems and locales, HardKAS enforces strict deterministic sorting for all arrays that affect cryptographic hashes.
- **Signature Sorting**: Signatures (e.g., in multisig transactions) are sorted using `deterministicCompare(a, b)` (byte-value comparison), **never** locale-dependent functions like `localeCompare`.

## 3. Visibility Semantics

Artifacts transition through strict visibility states to prevent ambiguous authority:

1. **Staged:** Written to a temporary file, invisible to observers.
2. **Committed:** Atomically renamed (`renameSync`) to its final deterministic hash path.
3. **Visible:** Picked up by the filesystem watcher.
4. **Indexed:** Successfully parsed by the `query-store`.

## 4. Crash Consistency & Recovery

- **Crash before rename**: Artifact remains invisible (temp file garbage collected).
- **Crash after rename**: Artifact committed, fully authoritative.
- **Projection corruption**: Fully rebuildable via `hardkas rebuild --from-artifacts`.
- **Append corruption (`events.jsonl`)**: The next append operation will detect the lock/staleness, truncate the corrupt tail, emit an anomaly, and proceed.

## 5. Localnet State Contract

The local simulated network uses a single file for state persistence to ensure proper bootstrap and indexer behavior.
- **State File**: `.hardkas/localnet.json`
- Forked states and new states must strictly use this filename. The indexer will exclude this file to prevent corrupted artifact warnings.

## 6. Strict JSON/Stdout Contract

All CLI commands intended for programmatic use must negotiate their schema version. Pipelines, CI, and external tooling depend on this stability. When using the `--json` flag, HardKAS outputs strictly parsed JSON to `stdout` with no extraneous logs.
