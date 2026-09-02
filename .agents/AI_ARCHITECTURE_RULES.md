# HardKAS AI Architecture Rules

This document explains the *why* behind HardKAS's architectural rules to prevent autonomous agents from breaking invariants.

## Execution Contract
- **Identity is explicit:** Execution target (`{ mode, domain, network }`) dictates behavior. Never infer execution mode from a network name or account string.
- **Simulator != Kaspa simnet:** `simulator` is a purely local, in-memory execution environment with synthetic accounts (`kaspa:sim_*`). `localnet` runs a real kaspa node process on a devnet/simnet network (`kaspasim:*`). `rpc` connects to a remote kaspa node.
- **Artifacts Rule:** When consuming artifacts, the artifact's execution identity is authoritative.

## UTXO Rules
- Node UTXO state is authoritative network evidence.
- HardKAS may derive a spendability view (`getSpendableUtxos`) by excluding:
  - Active mempool spends
  - Explicit caller exclusions
  - Future local reservations (if introduced)
- HardKAS must not invent a parallel UTXO ledger.
- `getSpendableUtxos` does not currently guarantee cross-process reservation. It provides *network-spendable candidates*.
- Never label an output "confirmed", "finalized", or "settled" solely because it appears in `GetUtxosByAddresses`.

## TOCTOU (Time-of-Check to Time-of-Use)
Mempool observation is subject to race conditions. Fetching UTXOs and then filtering by mempool leaves a window for state changes. `getSpendableUtxos` mitigates double-spends but is not a lock.

## State Ownership
- **Artifacts:** Durable/History
- **RPC/Node:** Authoritative Live
- **Localnet/Simulator:** Execution Context
- **Projections (`query-store`):** Read-only indexes. They do not own state.

## Planning Rules
- `getSpendableUtxos()` is a derived candidate view, not a reservation system.
- A successful plan does not reserve its selected inputs unless a future explicit reservation primitive says so.
- Do not introduce locks, leases, or persistent UTXO reservations without a Builder Lab reproducing a real concurrency failure.

## Evidence Semantics
- Mempool presence means pending network evidence, not acceptance.
- UTXO visibility means current node-indexed DAG state, not finality.
- Receipt submission means RPC acceptance only.
- Application states such as PAID or SETTLED remain application policy unless the SDK API explicitly defines stronger evidence.

## Release Qualification
- Unit/integration success inside the monorepo is not sufficient for Builder Lab closure.
- The original failing scenario must pass from a freshly installed published/packed RC in the external consumer.

