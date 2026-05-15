# HardKAS

[![NPM Version](https://img.shields.io/npm/v/@hardkas/sdk?color=red&label=sdk)](https://www.npmjs.com/package/@hardkas/sdk)
[![NPM Version](https://img.shields.io/npm/v/@hardkas/cli?color=red&label=cli)](https://www.npmjs.com/package/@hardkas/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**HardKAS** is a Kaspa-native developer operating environment and deterministic workflow environment. It provides a local-first, deterministic environment for planning, verifying, and debugging transactions and protocol-level integrations on the Kaspa BlockDAG.

---

## Published Packages

| Package | Version | Description |
|:---|:---|:---|
| [`@hardkas/sdk`](https://www.npmjs.com/package/@hardkas/sdk) | [![npm](https://img.shields.io/npm/v/@hardkas/sdk)](https://www.npmjs.com/package/@hardkas/sdk) | Full developer SDK for Kaspa |
| [`@hardkas/cli`](https://www.npmjs.com/package/@hardkas/cli) | [![npm](https://img.shields.io/npm/v/@hardkas/cli)](https://www.npmjs.com/package/@hardkas/cli) | Command-line interface for BlockDAG operations |
| [`@hardkas/core`](https://www.npmjs.com/package/@hardkas/core) | [![npm](https://img.shields.io/npm/v/@hardkas/core)](https://www.npmjs.com/package/@hardkas/core) | Core primitives and types |

---

> [!IMPORTANT]
> **Status: 0.2.2-alpha / Developer Preview**
> HardKAS is currently in Developer Preview. Features, APIs, and artifact formats are subject to evolution.

> [!CAUTION]
> **Not Production Custody Software.**
> HardKAS is a developer infrastructure tool. It is NOT intended for high-value mainnet custody. Always use dedicated, hardware-backed core wallets for production assets. See the [Security Model](docs/security-model.md) for details.

---

## Project Status

HardKAS is currently in Developer Preview (0.2.2-alpha).

The architecture is stabilizing, but users should be aware:
- **APIs may change**: Commands and SDK interfaces are not yet finalized.
- **Artifact formats may evolve**: Schema stability is a goal but not guaranteed.
- **Simulation is a light-model**: The localnet uses a deterministic light-model of the BlockDAG, not a full consensus implementation.
- **Encrypted Keystore**: Intended for developer workflows and local simulation only.
- **RPC Integrations**: Health and diagnostic features are still hardening.

### Functional Verification
HardKAS has a deterministic end-to-end local artifact workflow proof covering simulated L1 execution, replay invariants, query rebuilds, state reset equivalence, and negative mutation detection. 

Additionally, the **DX Acceptance Suite** verifies that every documented command (init, doctor, accounts, tx, query) works exactly as shown in a sandboxed environment, ensuring a reliable developer experience.

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
- **Early L2 Integration**: Foundational support for Igra EVM integration workflows.

### HardKAS IS NOT:
- **Production Custody**: Not a secure wallet for large-scale assets.
- **Full Node Implementation**: HardKAS orchestrates nodes but is not one itself.
- **Consensus Implementation**: Does not replace the official kaspad consensus logic.
- **Full GHOSTDAG/DAGKnight Parity**: The light-model simulates effects, not the full consensus protocol.
- **Trustless Bridge System**: Pre-ZK bridge integrations rely on multisig/MPC assumptions.
- **EVM on L1**: There is no EVM execution on the Kaspa L1 layer.

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
pnpm example:ci              # CI workflow demo
pnpm example:dag-reorg        # DAG reorg simulation
hardkas example list     # See all available examples
```

### CLI Reference

```bash
hardkas --help           # All command groups
hardkas tx --help        # Transaction commands
hardkas artifact --help  # Artifact verification
hardkas rpc --help       # RPC diagnostics
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
