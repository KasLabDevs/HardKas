# HardKAS 0.7.6-alpha

HardKAS is a local-first reproducible Kaspa developer runtime.

This release focuses entirely on operational resilience, artifact serialization, and local deterministic execution.

## Validated Core Features

- **Artifacts are canonical local truth:** The file system (`.hardkas/artifacts/`) dictates runtime state. SQLite databases, the Dev Server, and Dashboards are merely ephemeral projections.
- **Localnet Finality is local:** `simulated` and `localnet` modes are strictly for isolated development. Localnet is not mainnet finality.
- **Replay execution:** Replay functionality is deterministic only where supported. Unsupported environments will cleanly abort with an `unsupported` result rather than attempting to fake success.

## Explicit Limitations & Unsupported Features

We explicitly reject the following capabilities in `0.7.6-alpha`. Do not attempt to use them:

- **No Kaspa L1 EVM Execution:** Kaspa L1 does not execute EVM.
- **No SilverScript / Tockata Execution:** Native script execution is not yet supported.
- **No Trustless Exit / Bridges:** L2/Igra bridge tooling is experimental and read-only. There is no production bridge and no trustless exit.
- **No Covenant Execution:** Covenants cannot be deployed or simulated in this build.

## Release Readiness

Validated under extended deterministic local torture and golden corpus checks.

_Note: HardKAS 0.7.6-alpha is designed for developers building Kaspa integrations in isolated environments. It is not intended for mainnet deployment pipelines._
