---
title: Operator Commands
description: doctor, repair, inspect, rebuild, rotate and verify, the commands that check and repair a workspace's runtime state.
---

# Operator Commands

HardKAS fails loudly and recovers explicitly. The operator commands exist so that you never repair runtime state by
hand. Each one acts on the invocation's workspace (the nearest `hardkas.config.*` at or above the current directory, or
`--workspace <path>`), and each takes `--json`.

```bash
hardkas doctor
hardkas repair
hardkas repair --force
hardkas inspect
hardkas rebuild --from-artifacts
hardkas rotate
hardkas verify
```

## `hardkas doctor`

The full diagnostic: the local configuration, then the workspace's node (connectivity, network identity, sync,
capability for a flow). It exits 1 when any check in the report is `fail`, and 0 when every check is `pass`, `warn` or
`skip`. The report (human or `--json`) is the same either way, so a script can rely on the exit code or read
`summary.failed`. Its options and modules are in [Debugging](./debugging.md#1-the-workspace-hardkas-doctor).

## `hardkas repair`

Reports an outdated workspace, lock files in `.hardkas/`, torn tails of the JSONL streams (the event ledger
`events.jsonl` and `.hardkas/telemetry/telemetry.jsonl`) and a corrupt query store. It only reports by default: run
`hardkas repair`, read the findings, then `hardkas repair --force` to apply them. `--force` migrates the workspace,
removes the lock files **without checking whether their process is alive** (stop every other HardKAS process on the
workspace first), truncates a torn stream at its last complete line, and deletes a corrupt `.hardkas/store.db` (build it
again with `hardkas query store rebuild`). There is no `--dry-run`: the default run is the dry run.

## `hardkas inspect`

Reports the size of the two streams (the event ledger and the telemetry stream) and the telemetry archive segments.

## `hardkas rebuild`

Wipes and rebuilds the SQLite query store from the committed artifacts. `--from-artifacts` is required; the localnet
state is not rebuilt. It is the same rebuild as `hardkas query store rebuild` ([Query Store](./query-store.md)).

## `hardkas rotate`

Archives the telemetry stream (`.hardkas/telemetry/telemetry.jsonl`) once it reaches 10 MiB; `--force` rotates it
below that size. The event ledger is never rotated: it is append-only by contract.

## `hardkas verify`

Validates artifact integrity, schemas and lineage across the workspace, or for one path (`hardkas verify <path>`). It
performs no replay: `hardkas replay verify <receipt>` replays a simulator run
([Artifact Auditing](./artifact-auditing.md)).

**No silent recovery.** A repair is made only when you ask for it (`--force`), and an automatic one, such as the tail
repair of a JSONL stream on its next append, records an `EXTERNAL_MUTATION` anomaly in the telemetry stream
([Event Ledger and Telemetry](./telemetry.md)).
