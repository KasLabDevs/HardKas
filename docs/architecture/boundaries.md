# HardKAS Architecture Boundaries

This document formalizes the responsibilities and boundaries of each package in the HardKAS ecosystem. Maintaining these boundaries is critical for the project's stability, testability, and developer experience.

## Core Packages

### 1. `@hardkas/sdk` (The Facade)
- **Responsibility**: Provide a high-level, ergonomic entry point for developers.
- **Rules**:
  - Should orchestrate other packages (accounts, tx, rpc).
  - Should NOT contain low-level protocol logic.
  - Should remain "facade-only" where possible.

### 2. `@hardkas/accounts` (Identity & Signing)
- **Responsibility**: Resolve account names to addresses and manage signing backends.
- **Rules**:
  - Handles deterministic (simulated) and real (private key) accounts.
  - Abstracts away the difference between localnet and real network identities.
  - Should NOT handle transaction building (only signing of built transactions).

### 3. `@hardkas/tx-builder` (Protocol Logic)
- **Responsibility**: Construct raw Kaspa transactions and manage UTXO selection.
- **Rules**:
  - Pure protocol logic.
  - Should NOT know about "artifacts" or "filesystems".
  - Should be usable in any environment (web, node, etc.).

### 4. `@hardkas/artifacts` (Persistence & Schemas)
- **Responsibility**: Define and persist canonical HardKAS data structures (Plans, Signed Txs, Receipts).
- **Rules**:
  - Defines the `hardkas.<type>.v1` schemas.
  - Handles I/O and validation of these schemas.
  - Should NOT contain business logic or RPC calls.

### 5. `@hardkas/cli` (The Tooling)
- **Responsibility**: Provide a command-line interface for the toolkit.
- **Rules**:
  - Uses the SDK and internal runners to execute commands.
  - Should focus on UX, formatting, and orchestration.
  - Logic should be delegated to `@hardkas/sdk` or specialized packages.

### 6. `@hardkas/localnet` & `@hardkas/simulator` (The Runtime)
- **Responsibility**: Orchestrate local development environments and simulate DAG behavior.
- **Rules**:
  - `@hardkas/simulator`: Pure logic simulation of a Kaspa node.
  - `@hardkas/localnet`: State management and orchestration of the simulator or real Docker nodes.

## Layering Rules

1.  **Dependency Flow**: CLI -> SDK -> [Accounts, Tx-Builder, Artifacts, etc.].
2.  **No Circular Dependencies**: Packages should never depend on each other in a loop.
3.  **Honest States**: Artifacts should always report their state honestly (e.g., `simulated` vs `rpc`).
4.  **Facade Integrity**: The SDK should be the primary way external examples interact with the system.
5.  **Environment Agnosticism**: Core logic (Tx-Builder, Simulator) should be decoupled from the Node.js filesystem where possible.
