# CLI Reference

The `@hardkas/cli` package is your primary interface for workspace management, testing, and debugging.

## Global Flags

- `--json`: Outputs strict JSON to `stdout` instead of human-readable text. Ideal for programmatic use in CI pipelines.
- `--workspace <path>`: Override the target workspace directory.
- `--network <name>`: Target a specific network (e.g., `testnet-10`, `mainnet`).

## Core Commands

### `hardkas init`
Bootstraps a new workspace. Creates the `hardkas.config.ts` and the `.hardkas/` hidden directory.

### `hardkas verify`
Cryptographically verifies the lineage and integrity of all artifacts in the workspace.
- `--strict`: Fails if any artifact contains `localnet.json` leaks or corrupted tails.

### `hardkas localnet`
Manages the built-in simulated network.
- `hardkas localnet start`: Starts the simulator. State is saved to `.hardkas/localnet.json`.
- `hardkas localnet fork --network testnet-10`: Forks the state from a real network.

### `hardkas artifact inspect <id>`
Outputs the raw JSON of an artifact by its deterministic ID.

### `hardkas rebuild --from-artifacts`
Deletes the local SQLite projection and rebuilds it purely from the canonical filesystem artifacts. Use this if the dashboard or query store becomes stale.

## JSON Stdout Contract

When `--json` is provided, the CLI guarantees:
1. No un-parseable text is written to `stdout`.
2. Progress bars and warnings are sent to `stderr`.
3. The output adheres to the versioned schema defined in the runtime contract.
