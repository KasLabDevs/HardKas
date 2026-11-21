---
title: Event Ledger and Telemetry
description: The two operational streams of a workspace, the append-only event ledger and the rotatable telemetry stream, and how to read them.
---

# Event Ledger and Telemetry

HardKAS keeps two operational streams with different retention rules.

## Event ledger (`events.jsonl`)

The append-only operational record, at the workspace root (`<workspace>/events.jsonl`). It is never rotated. Each event
carries an `eventId`, a `domain` and a `kind`, and the `causationId` of the event that caused it when there is one. The
query store indexes it (`hardkas query events`, see [Query Store](./query-store.md)).

## Telemetry (`.hardkas/telemetry/telemetry.jsonl`)

The rotatable observability stream. It records anomalies, of 8 types: `LOCK_CONTENTION`, `STALE_LOCK_RECOVERY`,
`FS_RETRY`, `NORMALIZATION_COLLISION`, `REPLAY_RECONCILIATION`, `EXTERNAL_MUTATION` (for example a torn stream tail
repaired on append), `PATH_TRAVERSAL_ATTEMPT` and `ORPHAN_PROJECTION_RECOVERY`.

Each anomaly carries a severity (`low`, `medium`, `high`, `critical`), the subsystem that raised it (`lock`, `fs`,
`replay`, `normalization`, `query-store`, `lineage`, `projection`) and details; the context of the run that raised it is
kept per async call (`AsyncLocalStorage`). No stream means no anomaly was recorded.

```bash
hardkas telemetry inspect --limit 20
hardkas telemetry tail --follow
hardkas telemetry verify
hardkas inspect
hardkas rotate
```

- `telemetry inspect` shows the most recent events (`--limit`, default 5); `telemetry tail` prints the last lines
  (`--lines`, default 20) and, with `--follow`, keeps reading.
- `telemetry verify` checks every line against Telemetry Source Contract v1 and fails with
  `TELEMETRY_VERIFICATION_FAILED` (exit 1) when a line violates it.
- `hardkas inspect` reports both streams' sizes and the archive segments; `hardkas rotate` archives the telemetry
  stream once it reaches 10 MiB ([Operator Commands](./operator-commands.md)).

> [!NOTE]
> **How the streams are written.** Both are appended through one coordinator: it takes an exclusive lock file (created
> with `openSync(path, "wx")`, so only one writer gets it) and spins until it does, repairs a corrupted last line before
> it appends, and calls `fsync` after every write.
