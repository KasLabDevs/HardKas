# HardKAS State Authority

This document defines the strict rules for state management and authority within the HardKAS architecture. To prevent state drift, "fake balances", and race conditions, all components must adhere to the following Single Source of Truth rules.

## 1. Filesystem & Artifacts = Immutable Historical Truth
- The `.hardkas/` directory and its JSON artifacts are the **only** ultimate source of truth.
- If a transaction plan, receipt, trace, or event is not persisted to disk, it **does not exist** historically.
- Any manual modification to these artifacts (even if it breaks determinism) becomes the new ground truth.

## 2. SQLite / Query Store = Authoritative Derived Projection
- `packages/query-store` (SQLite) is the **authoritative projection** of the filesystem state.
- Components that need to query balances, transactions, or state must **only** read from the query store.
- The indexer is the only component allowed to write to this store, strictly deriving data from filesystem artifacts.

## 3. Dev-Server Memory = Transient Cache (Never Truth)
- `packages/dev-server` must **never** hold authoritative state in memory.
- In-memory variables representing account balances, transaction nonces, or block heights are strictly forbidden.
- The dev-server acts as a passthrough API layer, proxying reads to the `query-store` and emitting Server-Sent Events (SSE) based on indexer updates.

## 4. Dashboard = View (Never Authority)
- `apps/dashboard` is a pure view of the `query-store`.
- It must never assume a transaction succeeded simply because the RPC call returned without error.
- UI state updates happen strictly in response to SSE invalidation events from the dev-server, triggering a refetch from the API.

## 5. Causal Ledger (Events)
- The `events` table (or log) is an **append-only causal ledger**.
- It ensures strict ordering using `sequenceNumber` per `correlationId` and monotonic `globalOffset`.
- Events are decoupled from projections; they trigger UI invalidations and represent transitions, not final states.

## 6. Snapshots
- Snapshots are **portable local deterministic captures** of the current state.
- They bundle artifacts (authority) and projections (cache) alongside a strict `manifest.json`.
- They do **not** provide consensus proofs or external finality; they are strictly for local reproducibility.

## 7. Replay
- Replay ensures **local reproducibility**, not finality.
- It verifies that the current `query-store` projections can be fully rebuilt deterministically from the raw `artifacts` on disk.
- Mismatches denote state drift or corruption, categorized strictly into structural, deterministic, or runtime noise layers.

## Mental Model & Terminology
- **simulated**: Fast, in-memory execution without network topology or consensus. (Default)
- **localnet**: Execution on a real local node.
- **replay**: Re-execution of transactions based on existing artifacts.
- *simnet*: **Deprecated**. Do not use this term as it creates ambiguity between memory simulation and local test networks.
