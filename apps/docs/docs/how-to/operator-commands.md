---
title: Operator commands
---

HardKAS is designed to fail loudly and recover explicitly. Operator commands exist so developers do not repair runtime state by hand.

#### `hardkas doctor`

Full workspace diagnostic: locks, JSONL streams, projection health, anomalies, authority status.

#### `hardkas repair`

Recover JSONL tails, clear stale locks, rebuild SQLite, quarantine malformed files. Use `--dry-run` first.

#### `hardkas inspect`

Report stream sizes, archive segments, workspace metadata and operational status.

#### `hardkas rebuild`

Rebuild SQLite projections from canonical artifacts. `--from-artifacts` flag.

#### `hardkas rotate`

Rotate telemetry archives. Event ledger rotation is intentionally not supported (append-only by contract).

#### `hardkas verify`

Validate artifacts, semantic bundles and replay-relevant invariants.

**No silent recovery.** Any automatic repair emits an anomaly or visible operator message. Quiet corruption handling is treated as a runtime bug.
