# HardKAS Technical Documentation

Welcome to the technical documentation for **HardKAS 0.9.2-alpha**.

HardKAS is a deterministic, local-first developer environment for Kaspa
transaction workflows. It helps builders plan, sign, simulate, inspect, replay,
and explain transactions through explicit filesystem artifacts.

## What HardKAS Solves

Kaspa development involves UTXO discovery, fee estimation, signing, RPC
submission, and receipt tracking. Many tools mix those concerns into one opaque
operation.

HardKAS separates the lifecycle:

1. Planning creates a deterministic `txPlan` artifact.
2. Inspection and verification happen before key material is touched.
3. Signing creates a `signedTx` artifact linked to the plan.
4. Simulated or network execution creates a receipt artifact.
5. Replay and query tooling explain what happened.

## Product Boundary

HardKAS is **local-first**:

- Use `simulated` for the main development loop.
- Use Toccata v2 `simnet` when you need the certified local real-node baseline.
- Use testnet only when you need external integration.
- Treat mainnet as out of scope for the alpha happy path.

HardKAS does not replace Kaspa consensus and is not production custody software.
The real network remains the final validator for real transactions.

## 0.9.2-alpha Toccata Status

The current alpha includes Docker `rusty-kaspad` v2.0.0 simnet funding, a real
standard transaction lifecycle, real Silver OP_TRUE deploy/spend, simulator
artifact-coherence comparison, and a machine-verifiable golden corpus in
`pnpm gauntlet:toccata`.

Simulation claims are intentionally bounded:

- Artifact coherence: `READY_MATCH`.
- Runtime outcome: `PARTIAL`.
- VM/consensus equivalence: `NOT_CLAIMED`.
- Mainnet: `BLOCKED_BY_POLICY`.

## Core Capabilities

- Deterministic transaction artifacts.
- Planning and signing isolation.
- Local simulated UTXO state in `.hardkas/localnet.json`.
- Rebuildable SQLite query-store projection.
- Artifact inspection, verification, lineage, and replay.
- CLI, SDK, dev-server, and dashboard surfaces for the same workspace.

## Documentation Levels

- **New user:** [Installation](./getting-started/installation.md) and
  [Quickstart](./getting-started/quickstart.md).
- **Developer:** [Mental Model](./guides/01-mental-model.md),
  [Transaction Lifecycle](./concepts/transaction-lifecycle.md), and
  [SDK Reference](./reference/sdk.md).
- **Maintainer or auditor:** [Invariants](./concepts/invariants.md),
  [Security Model](./concepts/security-model.md),
  [Release Claims](./release-claims.md), and
  [Capability Matrix](./certification/capability-matrix.md).
