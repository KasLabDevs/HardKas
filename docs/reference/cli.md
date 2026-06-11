# CLI Reference

This page is a human summary. The generated canonical command surface lives in
`docs/reference/cli.generated.json`.

## `tx`

- `tx plan`: create a deterministic transaction plan. Common flags: `--from`,
  `--to`, `--amount`, `--network`, `--out`.
- `tx sign <planPath>`: sign a transaction plan. Common flags: `--account`,
  `--out`, `--append`.
- `tx send [signedPath]`: simulate or broadcast a signed transaction. In shortcut
  mode it can plan, sign, and send with `--from`, `--to`, and `--amount`.
- `tx wait <txId>`: wait for a transaction on a configured RPC network.
- `tx receipt <txId>`: show a receipt artifact.
- `tx verify <path>`: verify transaction artifact semantics.
- `tx compare <simulatedPath> <realPath>`: compare simulated and real receipts.

There is no top-level `tx simulate` command in the 0.9.6-alpha CLI. Use
`tx send --network simulated` or the SDK `sdk.tx.simulate(...)`.

## `artifact`

- `artifact inspect <id_or_path>`: decode and summarize an artifact.
- `artifact verify <path>`: verify hashes and schema. Use `--strict` for deeper
  semantic checks.
- `artifact lineage <path>`: show provenance.
- `artifact explain <path>`: produce a human-readable explanation.

## `accounts`

- `accounts list`: list configured accounts.
- `accounts balance <id>`: show balance.
- `accounts fund <id>`: fund a simulated/local development account.
- `accounts real init`: initialize the persistent development keystore.
- `accounts real generate`: generate encrypted development keys.
- `accounts consolidate <account>`: estimate or execute UTXO consolidation.

## `query`

- `query store sync`: index filesystem artifacts into SQLite.
- `query store doctor`: inspect projection freshness and health.
- `query store rebuild`: force a complete projection rebuild.
- `query artifacts list`: list indexed artifacts.
- `query lineage chain <anchor>`: trace artifact lineage.

## `localnet`, `dev`, And `dashboard`

- `localnet account create <name>`: create a simulated localnet account.
- `localnet snapshot create|verify|replay`: manage local deterministic snapshots.
- `dev server`: start the local HardKAS dev-server.
- `dashboard`: open the local observability dashboard.

## `verify`

- `verify --deep`: verify the canonical workspace artifact directory.
- `verify-semantics`: compare semantic truth across subsystems.
