---
title: Event ledger and telemetry
---

HardKAS separates two operational streams with different retention semantics:

#### Event ledger (`events.jsonl`)

Append-only operational evidence. Never rotated. Each event carries `eventId`, `causationId`, `domain`, and `kind`. Protected by `AppendCoordinator` with exclusive locks and fsync.

#### Telemetry (`telemetry.jsonl`)

Rotatable observability stream. 8 anomaly types: LOCK\_CONTENTION, STALE\_LOCK\_RECOVERY, FS\_RETRY, NORMALIZATION\_COLLISION, EXTERNAL\_MUTATION, PATH\_TRAVERSAL\_ATTEMPT, ORPHAN\_PROJECTION\_RECOVERY. Scoped via `AsyncLocalStorage`.

:::note
**AppendCoordinator.** JSONL persistence uses exclusive file locks (`openSync("wx")`), spin-wait acquisition, automatic tail repair for corrupted JSON, and `fsync` after every write.
:::
