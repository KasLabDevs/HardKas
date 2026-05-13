# HardKAS CLI Reference

Complete reference guide for HardKAS CLI commands.

## Global Summary

| Base Command | Description | Maturity |
| :--- | :--- | :--- |
| `hardkas init` | Initializes a new HardKAS project | `🟢 STABLE` |
| `hardkas tx` | Management and sending of L1 transactions | `🟢 STABLE` |
| `hardkas accounts` | Account and keystore management | `🟢 STABLE` |
| `hardkas query` | Relational artifact search engine | `🧪 PREVIEW` |
| `hardkas node` | Local node orchestration (Docker) | `🟢 STABLE` |
| `hardkas l2` | Igra L2 (EVM) integration | `🟢 STABLE` |
| `hardkas test` | Deterministic test runner | `🟠 MOCK` |

---

## Initialization Commands

### `hardkas init [name]`
Creates a HardKAS project structure in the current directory.
- **Flags**:
  - `--force`: Overwrites existing files.

### `hardkas up`
Verifies the environment and starts the configured basic services.

---

## Transaction Management (L1)

### `hardkas tx plan`
Creates a transaction plan based on the current configuration.
- **Options**: `--from`, `--to`, `--amount`, `--network`.

### `hardkas tx sign <path>`
Signs a transaction plan file.
- **Options**: `--account <name>`.

### `hardkas tx send [path]`
Broadcasts a signed transaction to the Kaspa network.
- **Shortcut Mode**: `hardkas tx send --from alice --to bob --amount 10`

---

## Query Engine

The query engine allows deep introspection of transaction history and artifacts.

### `hardkas query artifacts list`
Searches for artifacts in the local store.

### `hardkas query lineage chain <id>`
Reconstructs an artifact's provenance chain.

### `hardkas query dag conflicts`
Searches for potential double-spend conflicts in the local DAG.

---

## Node Orchestration

### `hardkas node start`
Starts a `kaspad` Docker container.

### `hardkas node logs`
Shows real-time node logs.

### `hardkas node reset`
Clears chain data and restarts the node from genesis.

---

## Igra L2 (EVM)

Commands for interacting with the EVM-compatible Kaspa layer 2.

### `hardkas l2 tx build`
Creates an EVM transaction for Igra.

### `hardkas l2 balance <address>`
Queries the balance of an address on the L2 network.

---

## Diagnostics

### `hardkas doctor`
Performs a full system check (Node.js, Docker, RPC, Keystore, Query Engine).
