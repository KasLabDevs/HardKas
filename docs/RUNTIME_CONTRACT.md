# HardKAS Runtime Contract
**Version**: 0.7.3-alpha

> *HardKAS assumes the user, the filesystem, and the runtime environment will eventually fail.*

This document defines the formal operational semantics, invariants, and guarantees of the HardKAS runtime environment. This is not a "happy path" assumption document; it is a strict specification of how the system degrades, recovers, and maintains determinism under adversarial conditions.

## 1. The Persistence Triad
HardKAS separates state into three distinct, non-overlapping categories.

### Canonical Truth (`.hardkas/artifacts/`)
- **Immutability**: Once an artifact is written and cryptographically signed, it is immutable.
- **Authority**: In the event of a conflict between the SQLite projection and the artifacts, the artifacts are the absolute source of truth.
- **Corruptions**: Corrupted artifacts are quarantined, not deleted. The system will halt operations related to a corrupted artifact to prevent downstream poisoning.

### The Event Ledger (`events.jsonl`)
- **Append-Only**: The `events.jsonl` file is an append-only ledger of formal `EventEnvelope` payloads.
- **No Rotation**: Under no circumstances will the runtime rotate, prune, or truncate `events.jsonl` during normal operation. It represents the historical causality graph.
- **Idempotency**: Downstream consumers must handle duplicate `eventId`s. The appender guarantees flush atomicity but relies on logical IDs for idempotency.

### Observational Projections (`.hardkas/store.db` & `telemetry.jsonl`)
- **Ephemeral**: The SQLite database and telemetry logs are considered *observational*. They can be safely deleted, corrupted, or rotated.
- **Reconstruction**: If `store.db` is missing or corrupted, it will be automatically reconstructed from the canonical artifacts (`hardkas rebuild`).

## 2. Concurrency and Locking
- **No Optimistic Locks**: The runtime uses atomic file descriptors (`fs.openSync(path, 'wx')`) to guarantee exclusive access.
- **Time-Of-Check to Time-Of-Use (TOCTOU)**: Newly created lock files are given a `2000ms` grace period before being evaluated for PID liveness to prevent read-before-write metadata races.
- **Liveness Proof**: Stale locks are detected via OS-level signals (`process.kill(pid, 0)`). `EPERM` is correctly interpreted as a live, isolated process.

## 3. Failure & Recovery Semantics
- **No Silent Failures**: The runtime will not silently swallow corruption. If a stream contains malformed JSON or invalid schema, operations halt and the user is directed to `hardkas repair`.
- **Operator Authority**: `hardkas repair` will explain anomalies and propose truncations (e.g., trailing garbage in `events.jsonl`), but will never execute destructive modifications without explicit operator consent (`--force` or interactive confirmation).
- **Chaos Proven**: The architecture is continuously fuzz-tested via the internal Chaos Engine (`hardkas chaos`).

## 4. Limits of Guarantees (Unsupported Behaviors)
HardKAS provides strict operational guarantees *only* within supported environments. The following scenarios result in **undefined behavior** and are explicitly unsupported:
- **Network Filesystems**: Running the workspace over NFS, SMB, or similar network shares.
- **Cloud Sync Races**: Active syncing by Dropbox, Google Drive, or OneDrive while the runtime is executing.
- **Cross-Machine Concurrency**: Attempting to write to the same `.hardkas` directory simultaneously from different physical machines.
- **Aggressive Antivirus Interception**: AV software locking SQLite WAL files or `.lock` files during critical I/O paths.
- **Manual Tampering**: Hand-editing `.json` artifacts or `events.jsonl` while `hardkas rebuild` or `hardkas run` is executing.

## 5. Known Operational Risks
While HardKAS has demonstrated extreme resilience across thousands of adversarial runs, operators should be aware of the following known physical limits:
- **Fsync Latency**: Sustained heavy workloads on slower HDDs can cause `fsync` bottlenecks on the event ledger.
- **Pathological File System Starvation**: Extremely high concurrent spawn rates may temporarily exhaust OS-level file descriptors or SQLite connection pools, triggering graceful degradation timeouts.
- **Stream Bloat**: If unrotated, `telemetry.jsonl` can grow to sizes that severely degrade query and parsing performance.
- **Watcher Inconsistencies**: File system watchers (for Dashboard live-reload) may drop events under heavy load, depending on OS-specific limits (e.g., `inotify` exhaustion on Linux).

## 6. Boundary of Domain (Kaspa Semantics)
HardKAS is an operational runtime designed to wrap Kaspa workflows, not a replacement for the Kaspa protocol. It is critical to define where HardKAS guarantees end and external network realities begin.

**What HardKAS IS NOT:**
- HardKAS is **not** a Kaspa consensus implementation.
- HardKAS is **not** a wallet.
- HardKAS is **not** a bridge security oracle.
- HardKAS is **not** a replacement for `rusty-kaspa`.

**The Formal Claim:**
> *HardKAS provides deterministic local transaction workflow semantics for Kaspa (planning, artifact generation, replay, and auditing), while live consensus, finality, mempool behavior, and RPC truthfulness remain strictly external to the runtime contract.*

An artifact pipeline within HardKAS can deterministically produce an unsigned Kaspa transaction artifact, sign it, verify the signature artifact locally, and emit a broadcast envelope—but the actual validation of that transaction by the global network lies outside HardKAS's authority.
