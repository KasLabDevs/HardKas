# `@hardkas/query-store`

The Query Store is a rebuildable SQLite projection of the workspace (`.hardkas/store.db`). It gives the CLI and the dev server fast reads without scanning every artifact file. The artifacts and the event ledger stay the authority; the database can always be deleted and rebuilt.

## 1. Indexing

### Flow: Sync (`hardkas query store sync`)

Needs an existing `.hardkas/store.db` (run `query store rebuild` first). In one SQLite transaction, rolled back on failure:

1. Indexes the workspace's artifact store (the files the artifact resolver reads, not every JSON file under `.hardkas/`). A file already indexed with the same modification time and content is skipped.
2. Mirrors the workspace's event ledger (`events.jsonl` at the workspace root): one row per event id. A legacy `.hardkas/events.jsonl` is reported, never merged.
3. Removes rows whose file is gone, and records what the projection was built from, so a later change makes it read as stale.

### Variant: Full Rebuild (`hardkas query store rebuild`, or `hardkas rebuild --from-artifacts`)

Wipes the tables and indexes everything again, in one transaction. Only one rebuild runs at a time (`QUERY_STORE_REBUILD_IN_PROGRESS`).

## 2. Diagnostics

### Flow: Store Doctor (`hardkas query store doctor`)

1. Reports whether the projection is absent, fresh or stale against the workspace's current state. Absent is fine: the query commands then read the workspace directly.
2. For a fresh projection, checks the database file (missing or empty), pending schema migrations, migration checksums, and rows whose file is missing or changed.
3. Prints what to run (`hardkas query store migrate` or `hardkas query store rebuild`) and exits 1 with `QUERY_STORE_UNHEALTHY` when something is wrong.

The doctor never rebuilds by itself.

### Variant: Migrations (`hardkas query store migrate`, or `doctor --migrate`)

Applies pending schema migrations under the query-store lock, each in its own transaction. A migration that fails is rolled back and reported (`STORE_MIGRATION_FAILED`); nothing rebuilds the store on its own, so run `hardkas query store rebuild` yourself if you want it built from scratch.
