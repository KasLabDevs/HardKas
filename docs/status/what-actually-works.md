# HardKAS: What Actually Works

This document summarizes the actual operational capabilities of HardKAS v0.2.2-alpha, separating the long-term vision from the functionality available today.

## Core Functionality (100% Operational)

### 1. L1 Transaction Lifecycle
- **Planning**: `hardkas tx plan` generates deterministic JSON artifacts.
- **Signing**: Integration with the keystore to sign plans.
- **Sending**: Robust broadcast via RPC.
- **Receipts**: Status tracking and `txReceipt` storage.

### 2. Account Management and Keystore
- Generation of Kaspa-compatible accounts.
- Local encrypted storage (`.hardkas/keystore`).
- Automated faucet for `simnet` environments.

### 3. Local Development Environment
- Docker orchestration of `kaspad`.
- Reset and logs integrated into the CLI.
- Health diagnostics via `hardkas doctor`.

### 4. L2 Integration (Igra)
- Support for EVM transactions.
- Contract deployment (planning).
- Querying balances and nonces on L2.

---

## Advanced Functionality (In Preview/Experimental)

### 1. Query Engine
- Relational search of artifacts by schema/sender/receiver.
- Transaction lineage tracking and 360-degree view.
- Divergence detection in replay with state hash verification.
- **Improved**: Full transactional store indexing with schema migrations.

### 2. Workspace Lock Safety
- Prevents concurrent mutation of store and node state.
- Supports `--wait-lock` and timeouts for CI/CD safety.

### 3. DAG Simulation
- Basic status monitoring.
- Controlled reorg simulation in localnet.

---

## What DOES NOT work yet (Roadmap)

### 1. Test Runner (`hardkas test`)
- **Current Status**: Mock. Prints a static result.
- **Goal**: Integrate Vitest/Mocha to run real tests against the SDK.

### 2. Transaction Tracing (`hardkas tx trace`)
- **Current Status**: Operational via query store.
- **Goal**: Add multi-hop graph visualization.

### 3. Session Persistence (`accounts lock/unlock`)
- **Current Status**: "Locking" is purely informational.
- **Goal**: Implement a session daemon or environment variable scoping to invalidate keys in memory.
