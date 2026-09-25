# Operational Boundaries

A critical requirement for operating HardKAS effectively is understanding where one boundary ends and another begins. A failure in the workspace is fundamentally different from a failure in the Kaspa RPC node.

## Execution Environments

| Environment | Scope | Node Lifespan | State Persistence |
| :--- | :--- | :--- | :--- |
| **Simulator** | `in-memory` | Single command | None. Destroyed on exit. |
| **Localnet** | `Docker` / Local Node | Background Task | Persisted to `.hardkas/localnet/` |
| **Testnet/Mainnet** | External RPC | Infinite | Persisted globally on Kaspa P2P |

## Process Boundaries

When diagnosing an issue, first isolate the failing process:

1. **The CLI Process (`hardkas`):** The orchestration wrapper. It reads `.hardkas/` files, plans transactions, signs them, and orchestrates RPC calls. It is ephemeral.
2. **The RPC Node (`kaspa-rpc`):** The external Kaspa daemon (`kaspad` or `rusty-kaspa`). HardKAS does not run this inside its own memory (except in Simulator). If `hardkas node start` was used, it runs as a managed background process via Docker.
3. **The Target Network:** The actual P2P network the node is connected to.

## State Ownership & Reversibility

If a command fails, you must understand the data volatility before attempting recovery.

> **CRITICAL:** Never execute destructive recovery commands (`rm -rf`) without understanding which data is reproducible and which is irretrievably lost.

### Irreversible State (Never Delete)

* **`.hardkas/accounts.real.json`**: Contains your local decrypted development keys. If you generated these without a seed phrase, deleting this file destroys the private keys and access to any funds.
* **`.hardkas/artifacts/`**: Contains the canonical intent of your deployments (e.g., `plan.json`, `receipt.json`). While the node holds the actual transaction, deleting the artifact severs HardKAS's ability to track, explain, or prove the intent.

### Rebuildable State (Safe to Delete)

* **`.hardkas/query-store/`**: This is a derived/rebuildable Read-Model projection. It owns zero state. It indexes artifacts and network states. If deleted, it can be rebuilt by re-syncing the artifacts, provided its canonical sources (`.hardkas/artifacts/`) remain available.
* **`.hardkas/localnet/` (Warning):** Deleting this destroys the Localnet DAG and mempool. It is "rebuildable" only in the sense that you can mine a new DAG, but all previous Localnet UTXOs and deployments will vanish.

## The Causal Chain

Every HardKAS operation follows a strict causal chain:
`Configuration` $\rightarrow$ `Workspace` $\rightarrow$ `Node/RPC` $\rightarrow$ `Transaction` $\rightarrow$ `Artifact` $\rightarrow$ `Evidence`

When troubleshooting, find the earliest point in the chain that failed.
