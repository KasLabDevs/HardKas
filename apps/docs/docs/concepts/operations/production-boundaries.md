# Production Boundaries

HardKAS capability maturity is not a monolithic boolean. Because it orchestrates bleeding-edge Kaspa features, you must evaluate the production boundary of each sub-system independently.

Evidence of capability does not equal a certification of production readiness.

## Maturity Matrix (As of Sep 25, 2026)

| HardKAS Sub-System | Current Status | Meaning for Operators |
| :--- | :--- | :--- |
| **Workspace & Artifacts** | `SUPPORTED` | Safe for CI/CD, deterministic pipelines, and artifact tracking. |
| **Transaction Builder (v0)** | `SUPPORTED` | Stable for standard Kaspa payments and mass transfers. |
| **Localnet Orchestration** | `SUPPORTED` | Safe for local testing, CI integration, and regression testing. |
| **Toccata (Tx v1 & Covenants)** | `EXPERIMENTAL` | Supported structurally by the CLI, but upstream APIs are still maturing. Expect minor UX changes. |
| **PSKT Workflows** | `EXPERIMENTAL` | Fully delegates to upstream. Valid for offline signing, but lacking hardware-wallet UI bridges. |
| **SilverScript Compliation** | `EXPERIMENTAL` | Supported via `silverc v1.0.0`, but complex covenant estimation tools are still lacking. |
| **vProgs & Based ZK** | `STRUCTURAL_ONLY` | HardKAS can only inspect schemas. It does not launch the vProgs node or manage RISC Zero proofs. |

## Production Qualification: NOT ESTABLISHED

> **Global Qualification:** HardKAS 0.12.0-rc.23 is currently in `NOT_ESTABLISHED` status for Mainnet Production deployment of Covenants and Based Applications.

**Why?**
1. **Network Policy:** HardKAS by default blocks interaction with Mainnet for experimental features (e.g., vProgs) unless strict overrides are used.
2. **Upstream Evolution:** While Toccata is active, upstream Kaspa node implementations (like `rusty-kaspa v2.1.0`) are actively hardening their DoS vectors and P2P behaviors post-fork.

Operators should confine current HardKAS workflows to `simnet` and `testnet-11`.
