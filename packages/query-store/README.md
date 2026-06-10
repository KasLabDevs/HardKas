# `@hardkas/query-store`

The Query Store is a rebuildable, heavily indexed SQLite projection of the `.hardkas/` workspace. It provides fast reads for CLI and Dashboard interactions without scanning thousands of JSON files.

## 1. Indexing Architecture

The query store relies _entirely_ on the filesystem (`artifacts/` and `events.jsonl`). The SQLite database itself is treated as ephemeral and rebuildable.

### Flow: Incremental Sync (`hardkas query store sync`)

1. The engine queries the current `MAX(eventId)` in the SQLite `events` table.
2. It opens `events.jsonl` and streams only lines where `id > MAX`.
3. It batch-inserts the new events in a single SQLite transaction to prevent corruption on crash.
4. It scans `artifacts/` for files newer than the last sync timestamp and updates the `artifacts` table.

### Variant: Full Rebuild (`hardkas rebuild --from-artifacts`)

If the SQLite file is deleted, corrupted, or schema migrations fail:

1. The SQLite file is purged.
2. `events.jsonl` is streamed from line 1.
3. `artifacts/` is traversed deeply.
4. The database is rebuilt from scratch, proving the mathematical determinism of the runtime.

## 2. Diagnostic Flows

Because the SQLite file is an ephemeral projection, it can diverge from the artifacts layer if a process is violently killed.

### Flow: Store Doctor (`hardkas query store doctor`)

1. Verifies the SQLite schema version against the current SDK version.
2. Runs `PRAGMA integrity_check`.
3. Counts rows in SQLite and compares them against the line count in `events.jsonl`.
4. If discrepancies are found, it prompts the user to run `sync` or `rebuild`.

### Variant: Silent Migration (`--migrate`)

If the schema is outdated (e.g., v3 to v4 after updating the HardKAS package), the `--migrate` flag triggers deterministic SQL `ALTER TABLE` statements. If a migration fails mid-way, the transaction rolls back, and the `Store Doctor` automatically triggers a Full Rebuild to ensure consistency.
