# HardKAS 0.9.7-alpha Release Notes

**Status:** `LOCAL_FIRST_DEVELOPER_RUNTIME_HARDENED` (Release Candidate)

This release concludes a major phase of local-first developer runtime hardening (P1 through P6). The goal of this phase was to ensure that developers have a deterministic, reproducible, and secure experience when building Kaspa-native applications locally against a simulated docker node (Toccata).

We explicitly do **NOT** claim `PRODUCTION_READY`, `TESTNET_READY`, `MAINNET_READY`, `L2_READY`, or `BRIDGE_READY`. Those networks remain `BLOCKED_BY_POLICY` for the happy path. 

## Milestones Achieved

- **P1: JSON Normalization & Mode Labels**
  All CLI outputs are now strictly JSON-compliant. A reality mode label (`SIMULATED`, `LOCAL_DOCKER`, etc.) is guaranteed on all outputs so orchestrators know the precise execution context.
- **P2: Capability Matrix & Documentation**
  Explicit tracking of what HardKAS can do, what modes are supported, and crucially, what is *not* claimed. The documentation boundaries are now clear.
- **P3: Localnet Funding UX**
  Implemented safe local-first shadow identities (`alice.localnet`). Developers can now smoothly fund accounts against the local Docker instance (`localnet fund alice`) without mutating or risking their primary Kaspa keystores.
- **P4: Reality Labels Across Transactions**
  Strict isolation between simulated transactions and real local docker transactions. Developers always know exactly where a transaction was planned, signed, and broadcasted.
- **P5: E2E Docker TX Lifecycle**
  A complete and fully verified transaction lifecycle against the Toccata localnet Docker container. From starting the network to funding, planning, signing, sending, querying the balance, and tearing down safely.
- **P6: Reproducible Install & Recovery**
  Hardened the system against sudden failures. The system cleanly manages state via a query store and correctly recovers gracefully from abrupt container terminations. Key handling enforces strict `0600` file permissions and redacts secrets from all JSON logs to prevent leakage in CI pipelines. 
- **P7: Version Boundary Alignment**
  A synchronized `0.9.7-alpha` version line across all packages, generated capabilities schemas, CLI help menus, and documentation.

## Core Commitments
If you are building locally, HardKAS provides a safe and deterministic sandbox. If you are aiming for Mainnet or Testnet, those flows require custom guards and are deliberately outside the standard developer workflow provided by this release.
