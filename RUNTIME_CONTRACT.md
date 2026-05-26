# HardKAS Formal Runtime Contract

This document formally defines the operational semantics, guarantees, and failure modes of the HardKAS runtime. This is not a "best effort" guide; it is the strict operational contract that the runtime must uphold.

## 1. Authority Model

HardKAS distinguishes between authoritative truth and observational projections.

- **Canonical Filesystem Artifacts**: The ultimate authority. Artifact files (`artifacts/`) represent the immutable, hash-addressed source of truth for the workspace.
- **Event Ledger (`events.jsonl`)**: The canonical history of mutations. It is an append-only stream of `EventEnvelope`s with causality tracking (`causationId`). It is **never rotated** and represents the cryptographic provenance log.
- **Telemetry Stream (`telemetry.jsonl`)**: Purely observational. It contains anomalies, performance metrics, and logs. It is **rotatable** and loss of telemetry does not invalidate canonical state.
- **SQLite Projection**: A disposable, derived index of the event ledger and artifacts. It is **never authoritative**. If it is lost, corrupt, or stale, it must be rebuilt from the event ledger and artifacts.
- **Semantic Bundle (`hardkas.semantic-bundle.v1.json`)**: The deterministic proof of execution. It is a canonical output, mathematically derived from the workspace state.
- **Dashboard Status**: Purely observational, derived from the watcher's reconciliation loop. It must never show GREEN if authority is ambiguous.

## 2. Crash Semantics

If the HardKAS runtime process is killed or crashes:

- **Crash during artifact write**: Handled via atomic writes (write to temp, `renameSync` to final). Partial artifacts will not exist. The temp file will be ignored on restart.
- **Crash during append (`events.jsonl` or `telemetry.jsonl`)**:
  - The JSONL line might be partially written (corrupt tail).
  - The append lock might be held.
  - Recovery: The next process attempting to append will detect the lock (or staleness), detect the corrupt JSONL tail, **truncate the corrupt bytes**, emit an `EXTERNAL_MUTATION` or `CORRUPT_TAIL_RECOVERED` anomaly, and proceed.
- **Crash during SQLite sync**:
  - The SQLite WAL or main DB may be in an inconsistent projection state.
  - Recovery: The watcher reconciliation sweep will detect the drift and trigger a full rebuild, or the `hardkas repair` tool will rebuild it.
- **Crash during watcher reconciliation**: Safe to crash. The sweep is idempotent.
- **Crash during dashboard query**: Safe to crash. The HTTP client will receive a connection reset.

## 3. Concurrency Semantics

- **Single-Writer vs Multi-Writer**: HardKAS supports multi-writer concurrency for CLI tools and parallel test runners targeting the same workspace.
- **Append Lock Guarantees**: `events.jsonl` and `telemetry.jsonl` are protected by physical filesystem locks (using exclusive create `wx` mode and lockfiles). The lock ensures strict serialization of appends.
- **Artifact Lock Guarantees**: Artifacts are immutable and content-addressed. Concurrency is handled by atomic file renames. Two processes writing the same artifact will overwrite each other safely with identical content.
- **Projection Rebuild Guarantees**: Rebuilding the SQLite projection locks the DB exclusively. Other processes attempting to read/write will wait or fallback to polling.
- **Unsupported Concurrent Modes**: Modifying `events.jsonl` externally (e.g., via `sed` or `vim`) while HardKAS is running is unsupported and will trigger an `EXTERNAL_MUTATION` anomaly.

## 4. Recovery Semantics

- **What repairs automatically**:
  - Stale or corrupt SQLite projection (rebuilt on startup or during watcher sweep).
  - Stale lockfiles (detected via pid liveness or timeout, automatically cleared).
  - Incomplete atomic artifact writes (abandoned `.tmp` files are ignored).
- **What requires operator action**:
  - Unrecoverable JSONL corruption in the *middle* of the event ledger (requires `hardkas repair` to quarantine or manual intervention).
  - Semantic drift where artifacts do not match the event ledger.
- **What emits anomaly**:
  - Any automatic recovery (stale lock cleared, tail truncated).
  - Slow appends (lock contention > 100ms).
  - Watcher polling fallback activated.
- **What is fatal**:
  - EACCES / ENOSPC (Cannot write to disk).
  - Missing canonical artifacts referenced in the event ledger.

## 5. Replay Semantics

- **Byte-Identical Replay Requirements**: Replaying a workflow must produce byte-identical semantic bundles.
- **Functionally Equivalent Replay**: If the underlying OS differs (e.g. Linux vs Windows), the semantic bundle remains byte-identical, but the telemetry and `executionDurationMs` will differ.
- **Non-Canonical Telemetry Nondeterminism**: Telemetry is inherently non-deterministic. Replaying the same workflow will yield a different telemetry stream.
- **Event Ordering Guarantees**: The event ledger enforces strict total ordering. Replays process the ledger sequentially.

## 6. Retention and Rotation

- **Event Ledger**: **EXPLICIT NON-ROTATION CONTRACT**. `events.jsonl` represents the canonical timeline. It is append-only and never pruned.
- **Telemetry**: Rotated automatically when it exceeds the configured size. Rotated segments are stored in `.hardkas/telemetry/archive/` and kept for a configurable retention period.
