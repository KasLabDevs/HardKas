# HardKAS Technical Documentation

Welcome to the technical documentation for **HardKAS 0.12.0-rc.20**.

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

## 0.12.0-rc.20 Toccata Status

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

- **New user:** [Installation](./start/installation.md) and
  [Quickstart](./start/quickstart.md).
- **Developer:** [Mental Model](./concepts/mental-model.md),
  [Transaction Lifecycle](./concepts/transaction-lifecycle.md), and
  [SDK Reference](./reference/sdk.md).
- **Maintainer or auditor:** [Invariants](./concepts/invariants.md),
  [Security Model](./concepts/security-model.md),
  [Release Claims](./status/release-claims.md), and
  [Capability Matrix](./status/capability-matrix.md).

## Map

### Start here — [`start/`](./start/)

Installing HardKAS and getting a first artifact on disk.

[Installation](./start/installation.md) ·
[Install and Init](./start/install-and-init.md) ·
[Quickstart](./start/quickstart.md) ·
[Quickstart (CLI)](./start/quickstart-cli.md) ·
[Quickstart (10 minutes)](./start/quickstart-10min.md) ·
[Your First Transaction](./start/first-transaction.md) ·
[Your First Scenario](./start/first-scenario.md) ·
[Configuration](./start/configuration.md)

### Concepts — [`concepts/`](./concepts/)

Why HardKAS is shaped the way it is.

[Why HardKAS](./concepts/why-hardkas.md) ·
[What HardKAS Is](./concepts/what-hardkas-is.md) ·
[Mental Model](./concepts/mental-model.md) ·
[Architecture](./concepts/architecture.md) ·
[Execution Worlds](./concepts/execution-worlds.md) ·
[Artifacts](./concepts/artifacts.md) ·
[Artifact Lifecycle](./concepts/artifact-lifecycle.md) ·
[Artifacts and Evidence](./concepts/artifacts-and-evidence.md) ·
[Evidence](./concepts/evidence.md) ·
[Determinism](./concepts/determinism.md) ·
[Transaction Lifecycle](./concepts/transaction-lifecycle.md) ·
[UTXO Management](./concepts/utxo-management.md) ·
[Accounts](./concepts/accounts.md) ·
[Providers](./concepts/providers.md) ·
[Kaspa Node](./concepts/kaspa-node.md) ·
[Localnet and Boundaries](./concepts/localnet-and-boundaries.md) ·
[Toolkit Layer](./concepts/toolkit-layer.md) ·
[Correct vs Incorrect Flows](./concepts/correct-vs-incorrect-flows.md) ·
[Invariants](./concepts/invariants.md) ·
[Security Model](./concepts/security-model.md)

### Guides — [`guides/`](./guides/)

Task-shaped instructions for work you already know you want to do.

[CLI Guide](./guides/cli.md) ·
[SDK Guide](./guides/sdk.md) ·
[CLI Wallet](./guides/cli-wallet.md) ·
[SDK Wallet](./guides/sdk-wallet.md) ·
[Wallet UTXOs](./guides/wallet-utxos.md) ·
[Building Apps](./guides/building-apps.md) ·
[Your First Test](./guides/your-first-test.md) ·
[Tasks](./guides/tasks.md) ·
[Plugins](./guides/plugins.md) ·
[Templates](./guides/templates.md) ·
[Jobs](./guides/jobs.md) ·
[Replay Verification](./guides/replay-verification.md) ·
[Artifact Auditing](./guides/artifact-auditing.md) ·
[Snapshot and Time Travel](./guides/snapshot-time-travel.md) ·
[Debugging](./guides/debugging.md) ·
[Troubleshooting](./guides/troubleshooting.md) ·
[Large Wallet Consolidation](./guides/large-wallet-consolidation.md) ·
[Real Node Transfer](./guides/real-node-transfer.md) ·
[Runtime and Docker](./guides/runtime-docker.md)

### Tutorials — [`tutorials/`](./tutorials/)

End-to-end applications built on HardKAS.

[Wallet App](./tutorials/wallet-app.md) ·
[Merchant Checkout](./tutorials/merchant-checkout.md) ·
[Payment Service](./tutorials/payment-service.md) ·
[Full Stack Demo](./tutorials/full-stack-demo.md)

### Reference — [`reference/`](./reference/)

Generated and stable API surfaces. `cli.md` and `cli.generated.json` are written
by `pnpm docs:generate-cli`; do not edit them by hand.

[CLI](./reference/cli.md) ·
[SDK](./reference/sdk.md) ·
[Client](./reference/client.md) ·
[Artifact Schema](./reference/artifact-schema.md) ·
[Errors](./reference/errors.md) ·
[Error Recovery](./reference/error-recovery.md) ·
[RPC Coverage](./reference/rpc-coverage.md)

### Status and claims — [`status/`](./status/)

Every release boundary, limitation, and claim lives here.

**[Release Claims (generated)](./status/claims.generated.md)** is authoritative:
it is produced from `packages/sdk` by `pnpm docs:generate-claims`, and
`pnpm docs:check-claims` fails the build if the committed copy drifts from the
code. The pages below are prose around those values, not a second source.

[Limitations and Boundaries](./status/limitations.md) ·
[Release Claims and Gates](./status/release-claims.md) ·
[Security Claims](./status/security-claims.md) ·
[Threat Model](./status/threat-model.md) ·
[Capability Matrix](./status/capability-matrix.md) ·
[Versioning](./status/versioning.md) ·
[Covenants Status](./status/covenants-status.md) ·
[TX V1 Status](./status/tx-v1-status.md) ·
[TX Version Compatibility](./status/tx-version-compatibility.md) ·
[Programmability Surface](./status/programmability-surface.md)

### Migrations — [`migrations/`](./migrations/)

[0.11 to 0.12](./migrations/0.11-to-0.12.md) ·
[0.12](./migrations/0.12.md)

### Internal — [`internal/`](./internal/)

Audit evidence and historical validation records. Not user documentation, and
excluded from `pnpm docs:verify-book`.
