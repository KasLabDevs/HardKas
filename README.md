# HardKAS: Deterministic Local Development Runtime

[![NPM Version](https://img.shields.io/npm/v/@hardkas/sdk?color=red&label=sdk)](https://www.npmjs.com/package/@hardkas/sdk)
[![NPM Version](https://img.shields.io/npm/v/@hardkas/cli?color=red&label=cli)](https://www.npmjs.com/package/@hardkas/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**HardKAS** is a **deterministic, local-first transaction planning and execution runtime** designed for high-confidence simulation, reproducible offline replays, and verifiable audit trails. 

Serving as a local developer cockpit, HardKAS provides developers and automated agents with an isolated sandbox environment to build, test, and audit transaction lineages with 100% mathematical reproducibility.

---

> [!IMPORTANT]
> **Status: 0.6.0-alpha (HARDENED ALPHA / P1.12 Complete)**
> HardKAS is in **Hardened Alpha**. All core transaction planning, candidate UTXO sorting, post-selection input ordering, and workstation security invariants are fully implemented, verified, and E2E-tested.

---

## 🚀 1. Quickstart (Local Simulated Mode)

HardKAS is fully optimized to run **completely offline** in a pure simulated mode with zero network or external RPC dependencies.

### Installation
```bash
# Install the CLI globally
npm install -g @hardkas/cli
```

### Scaffold Workspace
```bash
# Initialize a fresh workspace in the target directory
hardkas init demo
cd demo
```

### Fund simulated accounts
```bash
# Allocate virtual test balances to your local aliases
hardkas accounts fund alice --amount 1000
```

### Plan and execute offline transactions
```bash
# Plan and execute a transaction deterministically
hardkas tx send \
  --network simulated \
  --from alice \
  --to bob \
  --amount 10 \
  --yes
```
This generates a deterministic plan (`txPlan`) and execution receipt (`txReceipt`) under strict sorting invariants, written directly to `.hardkas/`.

### Replay & Verify Workspace
```bash
# Verify the mathematical and causal lineage of the workspace
hardkas replay verify .
```
Returns a clean `VERIFIED` report if all cryptographic hashes and invariants align.

---

## 🏛️ 2. Architectural & System Documentation Map

Every core axiom, security boundary, and operator playbook is organized strictly under the canonical directory structure:

### [HardKAS System Status Report (HARDKAS_STATUS.md)](./HARDKAS_STATUS.md)
The principal-engineer-level repository assessment, component maturity audit, and risk analysis.

### Canonical Specifications (`docs/canonical/`)
*   **[Runtime Invariants Spec](./docs/canonical/architecture.md)**: Filesystem authority axioms, SQLite caching boundaries, and local simulation limits.
*   **[Deterministic Replay Spec](./docs/canonical/replay.md)**: Causal pre-state time-travel rollback math and isolated sandbox executions.
*   **[Deterministic Guarantees Spec](./docs/canonical/deterministic-guarantees.md)**: Exact plan identities, sorting rules, and critical non-guarantees (consensus bounds, RPC limits).
*   **[Workstation Security Model](./docs/canonical/workstation-model.md)**: CSRF isolation, Host header whitelists, CORS limits, and DNS rebinding mitigations.
*   **[Semantic Vocabulary Canon](./docs/canonical/semantic-vocabulary.md)**: The single, authoritative glossary for core terms (Artifact, Projection, Replay, Snapshot, Stale).

### Operator Playbooks (`docs/guides/`)
*   **[Operator Getting Started](./docs/guides/getting-started.md)**: Scaffolding, funding simulated accounts, and planning offline transactions.
*   **[Sandboxed Workflows Guide](./docs/guides/workflows.md)**: Running orchestrations, sandbox policies, and causal diff audit trails.
*   **[State Snapshot Management](./docs/guides/snapshots.md)**: Capturing virtual state, snapshot invariants, and time-travel replay triggers.
*   **[Replay Debugging & Diagnostics](./docs/guides/replay-debugging.md)**: Handling `preStateHash` mismatches, fee deviations, and dynamic causal inspection.
*   **[Dashboard & Dev-Server Operations](./docs/guides/dashboard.md)**: Local background processes, REST endpoint tokens, and SSE reactive projections.

---

## 🛠️ 3. Monorepo Contribution & Development

If you want to contribute to HardKAS or build the packages from source:

### Clone & Build
```bash
git clone https://github.com/KasLabDevs/HardKas.git
cd HardKas
pnpm install
pnpm build
```

### Run Tests
```bash
# Run planners unit & determinism tests
pnpm --filter @hardkas/tx-builder test

# Run adversarial workflow corpus regression
pnpm test:workflows

# Run Playwright E2E visual dashboard test
pnpm --filter @hardkas/dashboard test:visual
```

---

## 📝 4. License
HardKAS is released under the **MIT License**. See the [LICENSE](LICENSE) file for the full text.
