---
title: Query Store
description: Build, check and query the SQLite read model (.hardkas/store.db) that indexes a workspace's artifacts and events.
---

# Query Store

The query store is a SQLite read model at `.hardkas/store.db`. It indexes the artifacts under `.hardkas/artifacts/` and
the workspace's event ledger (`events.jsonl`, at the workspace root) so that `hardkas query` commands answer fast.

**It owns no state.** The artifacts and the event ledger are the record; the store is derived from them. If it is
deleted, corrupted or out of date, rebuild it: nothing is lost.

## Build it and keep it current

No transaction command creates the store. Build it first, then index new artifacts with `sync`:

```bash
hardkas query store rebuild
hardkas query store sync
hardkas query store doctor
```

- `query store rebuild` wipes and rebuilds the index from the workspace (`--backend sqlite`, the default; the
  `filesystem` backend keeps no index, so it has nothing to rebuild). `hardkas rebuild --from-artifacts` does the same.
- `query store sync` (alias `index`) indexes the artifacts added since. It needs `.hardkas/store.db`: without it, it
  refuses with `QUERY_STORE_ABSENT` and writes nothing. `--strict` fails on any corrupted file instead of skipping it.
- `query store doctor` checks the schema version and the freshness of the index, and tells you to run
  `hardkas query store migrate` or `hardkas query store rebuild`. It never rebuilds by itself; `--migrate` applies
  pending migrations.

Commands that write the store take a lock: `--wait-lock` waits for it, `--lock-timeout <ms>` bounds the wait (default
30000). `hardkas repair --force` deletes a corrupt store; rebuild it afterwards ([Operator Commands](./operator-commands.md)).

## Query artifacts

```bash
hardkas query artifacts list --schema txPlan --json
hardkas query artifacts inspect <path-or-contentHash>
hardkas query artifacts diff <left> <right>
```

`artifacts list` filters by `--schema`, `--network`, `--mode` (simulator, localnet or rpc), `--from` and `--to`
addresses, sorts with `--sort <field:dir>` (for example `createdAt:desc`) and returns at most `--limit` rows (default
100). `inspect` takes a path or a `contentHash`, which is the artifact's id.

## Lineage, events and transactions

```bash
hardkas query lineage chain <artifactId>
hardkas query lineage chain <artifactId> --direction descendants
hardkas query lineage orphans
hardkas query events --domain <domain> --limit 20
hardkas query tx <txId>
hardkas query replay list
```

- `lineage chain <anchor>` rebuilds an artifact's ancestors (the default) or descendants from the index;
  `lineage transitions` lists every transition (`--root <hash>` for one flow) and `lineage orphans` finds artifacts
  whose lineage references are broken.
- `events` filters the event ledger by `--tx`, `--domain`, `--kind` or `--workflow`.
- `tx <txId>` gathers everything the workspace holds about one transaction.
- `replay list`, `replay summary <txId>`, `replay divergences` and `replay invariants <txId>` read the stored receipts.
  They are static checks of recorded fields: nothing is re-executed (`hardkas replay verify <receipt>` replays a
  simulator run, see [Replay Verification](./replay-verification.md)).

Most query commands take `--json` and `--explain [level]`, which attaches the explain chain of each result (the
`brief` and `full` levels currently give the same output); `--why` is short for `--explain full`.

## Raw SQL and export

```bash
hardkas query store sql <query> --json
hardkas query store export --output <path>
```

`sql` runs a read-only query against the store. A query that writes needs `--unsafe-write --yes`: the store is a
projection, and anything written there is lost at the next rebuild. `export` writes the store's logical state to a JSON
file.

The `hardkas query dag` views read a light-model DAG file that no command writes; see
[DAG Simulation](./dag-simulation.md).

<!-- qualification: artifacts -->
