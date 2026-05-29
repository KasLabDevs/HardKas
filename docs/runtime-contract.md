# HardKAS Runtime Contract (Public Summary)

HardKAS operates strictly as a deterministic, programmable runtime for Kaspa. This contract defines the operational guarantees and architectural invariants assumed by any system integrating with the CLI or SDK.

## Core Invariants

### 1. Filesystem Canonical Authority

The `.hardkas/artifacts/` directory is the absolute source of truth.
All state, workflows, and transaction history are derived purely from append-only JSON files. Modifying or deleting artifacts breaks causal continuity and will fail cryptographic verification.

### 2. Disposable Projections

The `.hardkas/store.db` (SQLite) and associated indexes are **optimization projections**.
They are strictly dispensable. Running `hardkas rebuild --from-artifacts` guarantees 100% accurate reconstruction of query state from the filesystem authority.

### 3. Workflow Identity & Determinism

A `workflowId` represents the _causal intent_ before execution.
It is generated _upfront_ via a deterministic hash of the workflow specification, network capability, and policy context. Ambient variables (`Date.now()`, `Math.random()`, or UUIDs) do not participate in canonical identity generation.

### 4. Separation of Capabilities and Policies

- **Capabilities**: What the environment _can_ do (e.g., Localnet access, Docker availability).
- **Policies**: What the workflow _is permitted_ to do (e.g., `allowNetwork: false`, `requireDryRun: true`).
  Agent orchestrators can rely on these boundaries to safely sandbox execution.

### 5. Deterministic Outputs (CLI)

When executing commands with `--json`:

- `stdout` emits **only** valid, machine-readable JSON data.
- `stderr` captures all UI logs, warnings, and spinners.
  JSON structures sort fields deterministically to avoid hashing discrepancies across platforms.

## Excluded Scope (Non-Goals)

HardKAS explicitly is NOT:

- A distributed consensus engine.
- A multi-writer cloud database.
- A general-purpose smart contract VM.
- A background node daemon (watchers are purely optimization hints, not correctness primitives).
