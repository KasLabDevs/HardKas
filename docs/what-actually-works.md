# What Actually Works in HardKas

## 1. Philosophy
HardKas is currently in the **v0.2.2-alpha (Developer Preview)** stage. The primary goal of this document is **technical honesty**: avoiding "fake completeness" and providing developers and contributors with a clear vision of what they can expect from the framework today.

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
| **Canonical Hashing** | STABLE | Implements content hashing to verify artifact integrity (Lineage). |
| **Docker Node Runner** | STABLE | Starts and stops `kaspad` containers reliably and idempotently. |
| **Localnet Orchestration** | STABLE | Orchestrates the local environment lifecycle (`hardkas up`, `hardkas node start`). |
| **Mainnet Guards** | STABLE | Hard protections that block accidental signatures and broadcasts to the main network. |
| **Query Store (SQLite)** | STABLE | The `QueryEngine` uses SQLite by default, reducing O(n) filesystem scans. |
| **Artifact Determinism** | STABLE | Reproducible hashes for semantic equivalence (Whitelist), ignoring variable metadata. |
| **Secret Redaction** | STABLE | Automatic recursive redaction of secrets in CLI logs and errors. |
| **Gitignore Hardening** | STABLE | `hardkas init` automatically adds `.hardkas/` to `.gitignore`. |

## 4. Partial Systems

| Area | Why Partial | Missing |
| :--- | :--- | :--- |
| **Keystore Integration** | The keystore is robust but its use is optional and manual. | Automatic integration into the `tx sign` flow without requiring extra flags. |
| **L2 Deploy-plan** | Packages bytecode and args. | Does not predict the contract address (CREATE/CREATE2 address prediction). |
| **Config Integration** | The CLI does not consume all options from `hardkas.config.ts`. | Total consistency between flags and configuration file. |
| **Snapshot Normalization** | Localnet snapshots work but are heavy. | Data normalization so that state snapshots are comparable across machines. |

## 5. Experimental / Research Systems

| Area | Why Experimental | Reality |
| :--- | :--- | :--- |
| **DAG Tooling** | Light graph simulation. | **It is not GHOSTDAG**. It is an educational tool to visualize conflicts and reorgs, not for validating real consensus. |
| **Conflict Analysis** | Based on simplified models. | Useful for detecting obvious double spending, but does not emulate real Kaspa "Blue Score" logic. |
| **L2 Bridge Assumptions** | Based on the Igra phase model. | Documents security assumptions (pre-zk, mpc, zk) but does not validate the bridge's cryptographic proofs. |

## 6. Placeholder / Mock Systems

| Area | Current State | Risk |
| :--- | :--- | :--- |
| **CLI Hints** | `Next: hardkas l2 tx send` (when it wasn't implemented). | **LOW**: User confusion. Many hints suggest commands that are barely in development. |
| **Session Lock/Unlock** | The command exists but does not clear real memory. | **MEDIUM**: "Security Theater". Gives a false sense that the key has been "deleted" from the session. |
| **Profile Loading** | L2 profiles are hardcoded in the binary. | **MEDIUM**: Prevents users from defining their own Igra networks in the config. |

## 7. Broken / Unwired Systems

These are the project's most critical "Wiring Gaps". The code is written and tested, but the CLI/SDK does not call it.

| Area | Problem | Impact |
| :--- | :--- | :--- |
| **L2 User Networks** | `registry.ts` ignores L2 networks from the config. | **MEDIUM**: The user can only use the built-in "igra" profile. |
| **Standard Lineage** | Not all artifacts verify their `sourceId`. | **LOW**: Breaks the formal provenance chain in some L2 flows. |

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

## 13. What Needs Immediate Hardening (P0)
1. **Invariant Stabilization**: Formally validate replay contracts in complex scenarios.
2. **Snapshot Normalization**: Achieve network states that are comparable bit-by-bit.

## 14. What Is Surprisingly Good
- **Artifact Architecture**: The data model is scalable and very clean.
- **Canonical Serialization**: Guarantees that the same object produces the same JSON.
- **Bridge Honesty**: Does not oversell L2 security.
- **Mainnet Stance**: Very conservative and safe for the developer.

## 15. Final Assessment

HardKas is currently:
**A laboratory for deterministic transactional workflows for Kaspa developers, NOT a production blockchain platform.**

The greatest virtue of the project today is not its completeness, but its **architectural honesty**. The pieces are in place; now they just need to be connected.
