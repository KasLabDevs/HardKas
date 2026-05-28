# HardKAS

HardKAS is a local-first reproducible Kaspa developer runtime. 

It moves beyond standard SDKs and dev-servers to provide a platform where Kaspa transactions, localnet executions, and development workflows are fully observable via an immutable **Artifact Graph**. All artifacts are the canonical local truth. SQLite, dashboards, and dev-servers are merely projections/facades over these artifacts.

## Key Features
- **Artifact-First Architecture:** The filesystem is the canonical source of truth. Every plan, transaction, and receipt is immutably appended.
- **Deterministic Sessions:** Take snapshots of your dev environment and utilize read-only time-travel debugging to inspect historical state changes. Replay is deterministic only where supported. Unsupported operations will fail gracefully.
- **Unified Send Semantics:** A single, consistent transaction envelope from the CLI to the browser facade.
- **Localnet & Simulated Modes:** Develop against local, isolated Kaspa nodes or fully mocked simulation networks seamlessly. Note: Localnet is not mainnet finality. Kaspa L1 does not execute EVM. L2/Igra bridge tooling is experimental/read-only. There is no production bridge, no trustless exit, no covenant execution, and no SilverScript/Tockata execution.

See the [Known Limits](./docs/known-limits.md) before using HardKAS for external systems.

## Getting Started
Head over to the [Quickstart Guide](./docs/quickstart.md).
