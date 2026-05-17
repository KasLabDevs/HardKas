# HardKAS

[![NPM Version](https://img.shields.io/npm/v/@hardkas/sdk?color=red&label=sdk)](https://www.npmjs.com/package/@hardkas/sdk)
[![NPM Version](https://img.shields.io/npm/v/@hardkas/cli?color=red&label=cli)](https://www.npmjs.com/package/@hardkas/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**HardKAS** is the **Deterministic Local Development Operating System** for Kaspa and Igra (L2). 

It provides a hardened, unified runtime for building, simulating, and auditing full-stack applications across Kaspa's BlockDAG and Igra's EVM execution layers, serving as the persistent developer cockpit for the entire BlockDAG ecosystem.

---

## Published Packages

| [`@hardkas/sdk`](https://www.npmjs.com/package/@hardkas/sdk) | [![npm](https://img.shields.io/npm/v/@hardkas/sdk)](https://www.npmjs.com/package/@hardkas/sdk) | Full developer SDK for Kaspa |
| [`@hardkas/cli`](https://www.npmjs.com/package/@hardkas/cli) | [![npm](https://img.shields.io/npm/v/@hardkas/cli)](https://www.npmjs.com/package/@hardkas/cli) | Command-line interface for BlockDAG operations |
| [`@hardkas/core`](https://www.npmjs.com/package/@hardkas/core) | [![npm](https://img.shields.io/npm/v/@hardkas/core)](https://www.npmjs.com/package/@hardkas/core) | Core primitives and types |
| [`@hardkas/react`](https://www.npmjs.com/package/@hardkas/react) | [![npm](https://img.shields.io/npm/v/@hardkas/react)](https://www.npmjs.com/package/@hardkas/react) | Local-first React integration layer |
| [`@hardkas/sessions`](https://www.npmjs.com/package/@hardkas/sessions) | [![npm](https://img.shields.io/npm/v/@hardkas/sessions)](https://www.npmjs.com/package/@hardkas/sessions) | L1/L2 Identity & Context Management |
| [`@hardkas/bridge-local`](https://www.npmjs.com/package/@hardkas/bridge-local) | [![npm](https://img.shields.io/npm/v/@hardkas/bridge-local)](https://www.npmjs.com/package/@hardkas/bridge-local) | Local bridge entry simulation engine |

---

> [!IMPORTANT]
> **Status: 0.3.0-alpha / HARDENED ALPHA**
> HardKAS is currently in **HARDENED ALPHA**. This means core determinism, cross-platform hashing, and adversarial resilience are stable and verified. It is moving toward Beta Candidate status through architectural convergence and documentation hardening.

> [!CAUTION]
> **Not Production Custody Software.**
> HardKAS is a local developer infrastructure tool. It does NOT validate Kaspa consensus, prove bridge correctness, or provide production-grade security for high-value mainnet assets. Always use hardware-backed wallets for production.

---

HardKAS is currently in **HARDENED ALPHA** (0.3.0-alpha).

The architecture is stabilizing, but users should be aware:
- **APIs may change**: Commands and SDK interfaces are not yet finalized.
- **Artifact formats may evolve**: Schema stability is a goal but not guaranteed.
- **Simulation is a light-model**: The localnet uses a deterministic light-model of the BlockDAG, not a full consensus implementation.
- **Encrypted Keystore**: Intended for developer workflows and local simulation only.
- **RPC Integrations**: Health and diagnostic features are still hardening.

### Functional Verification
HardKAS has a deterministic end-to-end local artifact workflow proof covering simulated L1 execution, replay invariants, query rebuilds, state reset equivalence, and negative mutation detection. 

### Trust Boundaries
- **Simulation**: Localnet is a **research-experimental** light-model, not a consensus validator.
- **Replay**: Replay verification ensures **local workflow consistency**, not L1 finality.
- **Artifacts**: contentHash guarantees **internal integrity**, not on-chain confirmation.
- **L2 Bridge**: Igra integration assumes **pre-ZK multisig/MPC assumptions**.

---

## What HardKAS IS vs. IS NOT

### HardKAS IS:
- **Developer Tooling**: Built for high-velocity local iteration.
- **Deterministic Simulation**: Provides reproducible transaction and state models.
- **Transaction Planning**: Formalizes the lifecycle of a transaction from plan to receipt.
- **Replay/Debugging**: Enables deterministic tracing of past simulated events.
- **Artifact Verification**: Strict auditing of transaction integrity and semantics.
- **Localnet Orchestration**: Simplifies managing kaspad nodes and simulated states.
- **RPC Diagnostics**: Comprehensive network and node health tools.
- **L1/L2 Identity Management**: Session-aware developer context resolution.
- **Bridge-Entry Simulation**: Deterministic simulation of Kaspa -> Igra entries.
- **Native Kaspa Wallet (Local)**: Deterministic L1 wallet management for devs.
- **React Integration**: Local-first hooks for full-stack prototyping.
- **Early L2 Integration**: Foundational support for Igra EVM integration workflows.

### HardKAS IS NOT:
- **Production Custody**: Not a secure wallet for large-scale assets.
- **Consensus Software**: Does not replace or replicate the official kaspad consensus logic.
- **Full Node Implementation**: Orchestrates node runners but is not a consensus node.
- **Bridge Correctness Proof**: Does not prove the validity of cross-chain bridges or Igra exits.
- **SilverScript/Covenant Runtime**: Does not provide a live execution environment for Kaspa L1 covenants.
- **Kaspa Finality Proof**: Simulation finality is local-only; it does not represent L1 finality.
- **Full GHOSTDAG/DAGKnight Parity**: The light-model simulates structural effects, not the full bit-for-bit consensus protocol.
- **Trustless Bridge System**: Current bridge modeling assumes MPC/Multisig trust boundaries.
- **EVM on L1**: There is no EVM execution on the Kaspa L1 layer.
- **Kaspa L1 Auditor**: It audits developer workflows, not the Kaspa L1 protocol itself.
- **"Hardhat for Kaspa"**: HardKAS is a multi-layer BlockDAG infrastructure platform. While it provides similar developer comfort, its architecture is built for the unique deterministic and structural requirements of Kaspa and ZK-ready L2s.

---

## Architecture Honesty

HardKAS maintains strict boundaries between different architectural layers:

### Kaspa L1 (BlockDAG)
- **Model**: UTXO-based BlockDAG.
- **Responsibility**: Sequencing and Data Availability.
- **Execution**: No EVM or programmable account-based state on L1.

### Igra L2 (Execution)
- **Model**: EVM-compatible, account-based state.
- **Status**: Separate execution environment for programmable logic.
- **Support**: HardKAS provides early integration preflights for Igra deployments.

### Bridge Realities
- **Pre-ZK**: Bridge modeling assumes trusted multisig or committee-based MPC assumptions.
- **Target**: Move toward ZK-based trustless models as the protocol matures.

---

### stable
- **Deterministic Artifacts**: Canonical schemas for Plans, SignedTx, and Receipts.
- **Replay Invariants**: Reproducible simulated transaction outcomes.
- **Snapshot Hashing**: Verifiable state snapshots for localnet persistence.

---

## Local Igra Onboarding

HardKAS provides a dedicated flow for local Igra (Kaspa L2) development:

1. **Diagnose**: `hardkas dev doctor` — Check environment health.
2. **Setup**: `hardkas local wizard` — Guided account creation and funding.
3. **Identity**: `hardkas session create` — Link L1 and L2 identities.
4. **Runtime**: `hardkas dashboard` — Launch the visual developer cockpit.
5. **Connect**: MetaMask & KasWare Local Adapters — Sync browser wallets to the local session.
6. **Bridge**: `hardkas bridge local plan` — Simulate cross-layer entry.
7. **Prototyping**: `@hardkas/react` — Full-stack hooks for local apps.

> [!CAUTION]
> **Developer Only**: These tools are strictly for local development and simulation. Never export production secrets or use these tools for mainnet assets.
- **Semantic Verification**: Deep auditing of fee correctness and lineage.
- **Encrypted Dev Keystore**: Argon2id/AES-256 protected local keys.
- **RPC Resilience**: Automated retries, health scoring, and diagnostics.

### preview
- **Igra L2 Integration**: Early contract deployment preflights.
- **Bridge Modeling**: Modeling cross-chain state transitions.
- **Lineage Extensions**: Advanced provenance tracking across complex flows.

### research
- **DAG Light-Model**: High-level simulation of reorgs and conflict handling.
- **Anomalies Engine**: Deep DAG state introspection.

### Planned
- **Multi-node Localnet**: Orchestrating local clusters for networking tests.
- **Visual Trace Explorer**: Browser-based visualization of BlockDAG traces.
- **SilverScript Tooling**: Native support for advanced Kaspa script auditing.
- **vProg Tooling**: Verified protocol-aware programming utilities.
- **Fuzzing Infrastructure**: Automated mutation testing for artifact resilience.

---

## Design Philosophy

- **Local-First**: High-fidelity development should not require an internet connection.
- **Simulation-First**: Validate logic in a deterministic environment before touching the wire.
- **Deterministic by Default**: Avoid ambient state; all operations should be reproducible.
- **Explicit over Implicit**: Clear artifact boundaries and visible metadata.
- **Replay-Safe**: All transaction logic must be audit-ready and replay-verifiable.
- **Artifact-First**: Comprehensive observability and diagnostic discipline.
- **No Protocol Inflation**: No claims of protocol features (like L1 smart contracts) that do not exist.

---

## Quickstart

Get started with HardKAS in seconds.

### 1. Install the CLI globally

```bash
pnpm install -g @hardkas/cli
```

### 2. Initialize your project

```bash
hardkas init
```

### 3. Start the local node

```bash
hardkas node start
```

### 4. Manage Accounts

```bash
hardkas accounts list
```

### 5. Send a Transaction (Simulated)

```bash
hardkas tx send --from alice --to bob --amount 10
```

### 6. Run Tests

```bash
hardkas test
```

---

## Local Development (Monorepo)

If you want to contribute to HardKAS or run the examples from source:

### 1. Clone & Build

```bash
git clone https://github.com/KasLabDevs/HardKas.git
cd Hardkas
pnpm install
pnpm build
```

### 2. Initialize a project

```bash
hardkas init
```

### 3. Start the node

```bash
hardkas node start
```

### 4. Manage Accounts

```bash
hardkas accounts list
```

### 5. Send a Transaction (Simulated)

```bash
hardkas tx send --from alice --to bob --amount 10
```

### 6. Run Tests

```bash
hardkas test
```

### 7. Verify Artifacts

```bash
hardkas artifact verify .hardkas/artifacts/ --recursive
```

### Run examples

```bash
pnpm example:ci
pnpm example:dag-reorg
hardkas example list
```

### CLI Reference

```bash
hardkas --help
hardkas tx --help
hardkas kaspa --help
hardkas bridge --help
hardkas session --help
hardkas artifact --help
hardkas rpc --help
```


---

HardKAS is released under the **MIT License**. See the [LICENSE](LICENSE) file for the full text.

### Alpha Disclaimer

The project is provided as developer infrastructure tooling in active alpha development **WITHOUT WARRANTY** of any kind, express or implied. 

- **Developer Tooling**: HardKAS is intended for local-first simulation and developer workflows.
- **Not for Production Custody**: It is NOT production-grade custody software.
- **Key Handling**: Users are solely responsible for the handling and security of their mainnet private keys. 
- **Encrypted Keystore**: The local encrypted keystore is designed for developer convenience in simulation environments, not for high-value asset protection.

By using HardKAS, you acknowledge that you understand the risks associated with alpha-stage infrastructure tooling.
