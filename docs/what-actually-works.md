# What Actually Works in HardKas

## 1. Philosophy
HardKas is currently in the **v0.2.2-alpha (HARDENED ALPHA)** stage. The primary goal of this document is **technical honesty**: avoiding "fake completeness" and providing developers and contributors with a clear vision of what they can expect from the framework today.

In HardKas, we follow these premises:
- "Implemented" != "Production-ready".
- "CLI command exists" != "Feature works end-to-end".
- Architectural honesty is preferred over marketing.

```text
This document intentionally separates:
- STABLE: Real, end-to-end functionality.
- PARTIAL: Works but has significant gaps or limitations.
- EXPERIMENTAL: Functional but based on simplified or research models.
- PLACEHOLDER: UX shape only; no real logic yet.
- BROKEN / UNWIRED: Subsystem exists but is disconnected from the runtime.
```

## 2. Classification Model

| Status | Meaning |
| :--- | :--- |
| **STABLE** | Works reproducibly, is deterministic, and is integrated into the main flow. |
| **PARTIAL** | Core logic is functional, but critical integrations (config, persistence) are missing or it has DX limitations. |
| **EXPERIMENTAL** | Research or light simulation tools that do not aim to validate real consensus (GHOSTDAG) but rather assist in debugging. |
| **PLACEHOLDER** | "UX Theater": Prints static output or exists only to define the future shape of the interface. |
| **BROKEN / UNWIRED** | High-quality code that exists in the repository but is NOT invoked by the main engine (dead/disconnected code). |

## 3. What Actually Works (Stable)

| Area | Status | Notes |
| :--- | :--- | :--- |
| **TX Plan (L1)** | STABLE | Generates deterministic UTXO transaction plans. Validates balances and correctly structures the JSON. |
| **TX Sign (L1)** | STABLE | Signs plans using `kaspa` WASM SDK. Supports real and simulated accounts. |
| **TX Send (Simnet)** | STABLE | Sends signed transactions to local nodes. Works end-to-end in development environments. |
| **Artifact Serialization** | STABLE | The artifact engine correctly serializes plans, signatures, and receipts in `.hardkas/`. |
| **Localnet Orchestration** | STABLE | Orchestrates the local environment lifecycle (`hardkas up`, `hardkas node start`). |
| **Mainnet Guards** | STABLE | Hard protections that block accidental signatures and broadcasts to the main network. |
| **Docker Node Runner** | STABLE | Starts/stops `kaspad` containers with RPC readiness guarantee. Supports **multiple networks** (simnet, testnet). Blocks mainnet local nodes. |
| **Query Store (SQLite)** | STABLE | The `QueryEngine` uses SQLite by default. Configured with `synchronous = FULL` and **workspace locking**. Supports **atomic migrations**, **rebuild**, and **deterministic JSON export**. Explicitly a rebuildable cache (artifacts remain source of truth). |
| **Artifact Determinism** | STABLE | **Type-safe canonical hashing (v3)**. Includes NFC Unicode normalization and CRLF/LF normalization. Version-aware identity (schema changes alter hashes). |
| **Lineage Integrity** | STABLE | Strict provenance chains (parent-linkage) and network/mode isolation. Verified through **Adversarial Verification** tests (cycles, cross-network). |
| **Workspace Locking** | STABLE | Prevents concurrent writes. Includes **robust recovery UX** (`hardkas lock doctor`, `hardkas lock clear --if-dead`) verified against process crashes (SIGKILL). |
| **Secret Redaction** | STABLE | Automatic recursive redaction of secrets in CLI logs and errors. |
| **Gitignore Hardening** | STABLE | `hardkas init` automatically adds `.hardkas/` to `.gitignore`. |
| **DAG Tooling** | EXPERIMENTAL | Implements `ApproxGhostdagEngine`. It is a structural research model for topological concept alignment, NOT bit-for-bit consensus parity. |
| **Conflict Analysis** | STABLE | Deterministically detects double spending and displacement events. |
| **Keystore (v2)** | STABLE | Argon2id/AES-256-GCM encrypted storage by default with restrictive (0600) permissions. |
| **Account Metadata Index** | STABLE | Separates non-secret metadata from secret material for efficient listing. |
| **Reproducibility Proof v1** | STABLE | Cross-platform proof: same code + same inputs = same contentHash across Linux, macOS, and Windows. Verified in CI. |
| **Adversarial Verification** | STABLE | Automated tests for malicious artifact detection (hash mismatches, lineage loops, cross-network parentage). |
| **Property Testing** | STABLE | High-coverage state and artifact property tests using `fast-check`. |
| **Release Hygiene** | STABLE | `pack-release.ts` enforces clean state (no .hardkas, no env, no node_modules) for release artifacts. |
| **Deployment Tracking** | STABLE | Local workflow tracking in `.hardkas/deployments/`. Supports labels, status verification, and lineage linking. |
| **Session Management** | STABLE | L1/L2 identity linkage and context resolution. Prevents cache collisions with session-aware query keys. |
| **Bridge Local (Sim)** | STABLE | Deterministic bridge-entry simulation (Kaspa -> Igra). Includes prefix mining simulation. |
| **Kaspa L1 Wallet** | STABLE | Native CLI wallet management for development (create, list, balance, send). |
| **React Hooks** | STABLE | Local-first React integration layer (`@hardkas/react`) with session-aware hooks. |
| **Console / REPL** | STABLE | Interactive Node.js REPL with HardKAS SDK and test harness pre-injected as `h`. |
| **Capabilities API** | STABLE | Machine-readable self-description via `hardkas capabilities --json`. |

## 4. Partial Systems

| Area | Why Partial | Missing |
| :--- | :--- | :--- |
| **L2 Deploy-plan** | Packages bytecode and args. | Does not predict the contract address (CREATE/CREATE2 address prediction). |
| **Config Integration** | The CLI does not consume all options from `hardkas.config.ts`. | Total consistency between flags and configuration file. |
| **Snapshot Normalization** | Localnet snapshots work but are heavy. | Data normalization so that state snapshots are comparable across machines. |

## 5. Experimental / Research Systems

| Area | Why Experimental | Reality |
| :--- | :--- | :--- |
| **L2 Bridge Assumptions** | Based on the Igra phase model. | Documents security assumptions (pre-zk, mpc, zk) but does not validate proofs. |

## 6. Placeholder / Mock Systems

| Area | Current State | Risk |
| :--- | :--- | :--- |
| **CLI Hints** | `Next: hardkas metamask ...` | **LOW**: User confusion. Most hints are now aligned with v0.3.0 commands. |
| **Profile Loading** | L2 profiles are hardcoded in the binary. | **MEDIUM**: Prevents users from defining their own Igra networks in the config. |

## 7. Broken / Unwired Systems

These are the project's most critical "Wiring Gaps". The code is written and tested, but the CLI/SDK does not call it.

| Area | Problem | Impact |
| :--- | :--- | :--- |
| **L2 User Networks** | `registry.ts` now correctly resolves networks from `hardkas.config.ts`. | **CLOSED** |
| **Standard Lineage** | Lineage checks are now enforced across the artifact engine. | **CLOSED** |

## 8. Security Reality
HardKas **prioritizes developer security against accidental errors**, NOT institutional-grade asset custody.

- **NOT a custodial wallet.**
- **Does NOT use HSM or secure memory enclaves.**
- **Plain text accounts** (`accounts.real.json`): Exist for rapid development (Hardhat style).
- **Automated .gitignore**: `hardkas init` protects the `.hardkas/` folder by default.
- **Mainnet is protected** by network guards and explicit flags.

## 9. Testing Reality
Following the recent mock removal:
- **Testing is REAL**: Executes real `.test.ts` files using **Vitest**.
- **Injected Runtime**: The SDK is available within the tests.
- **Deterministic State**: Efforts are made to reset Localnet between tests, but the performance cost is high.
- **Limitation**: Still immature and lacks detailed documentation of assertion helpers.

### Known Pre-existing Failures

| Test | Package | Status |
| :--- | :--- | :--- |
| `Replay Invariants > should fail if preStateHash mismatch` | `@hardkas/localnet` | **RESOLVED** — `verifyReplay()` now compares `preStateHash` against current state hash. Produces explicit `preStateHash mismatch` error. |

## 10. L2 / Igra Reality
- **Total Separation**: The Tooling understands that L1 != L2.
- **Igra Tx Pipeline**: Build, Sign, and Send work (via RPC).
- **Bridge Honesty**: Does not claim the bridge is trustless today (warns of `pre-zk` phase).
- **Gaps**: Missing connection between the profile system and user configuration.

## 11. Performance Reality
- **Efficient Indexing**: Thanks to SQLite, performance significantly improves by avoiding O(n) scans; final performance depends on the query and indices.
- **JSON Overhead**: Much of the internal communication is heavy JSON; acceptable for development but inefficient for massive indexing.

## 12. What Is Production-Ready?

| Ready For | Status |
| :--- | :--- |
| **Local Developer Workflows** | YES |
| **CI/CD Experimentation** | YES (with semantic equivalence) |
| **Educational Tooling** | YES (Excellent architecture) |
| **Production Custody** | **NO** |
| **Mainnet Automation** | **NO** |
| **Large-scale Indexing** | **NO** |

## 13. What Needs Immediate Hardening (P1)
1. ~~**GHOSTDAG Singleton**: Module-level engine prevents parallel DAG instances.~~ **CLOSED** — Engine is now per-DAG.
2. **Consensus Replay**: Implement real GHOSTDAG replay verification for artifacts.
3. **Snapshot Normalization**: Achieve network states that are comparable bit-by-bit.
4. ~~**Replay preStateHash**: Wire `verifyReplay()` to check `preStateHash` against the provided state.~~ **CLOSED** — Implemented and covered by tests.

## 14. What Is Surprisingly Good
- **Artifact Architecture**: The data model is scalable and very clean.
- **Canonical Serialization**: Guarantees that the same object produces the same JSON.
- **Bridge Honesty**: Does not oversell L2 security.
- **Mainnet Stance**: Very conservative and safe for the developer.

## 15. Final Assessment

HardKAS is currently:
**A hardened laboratory for deterministic transactional workflows for Kaspa developers, moving toward Beta Candidate status.**

The project has achieved **HARDENED ALPHA** through rigorous testing and architectural honesty. The transition to Beta will focus on API stabilization and documentation convergence.
