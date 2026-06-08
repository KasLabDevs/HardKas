# HardKAS Technical Documentation

Welcome to the definitive technical documentation for **HardKAS 0.8.x**.

HardKAS is an isolated, deterministic, artifact-driven transaction lifecycle engine for Kaspa. It is designed to safely abstract the complexities of UTXO management, cryptographic signing boundaries, and Node RPC communications into a rigid, verifiable pipeline.

## What HardKAS Solves

Kaspa transactions involve raw UTXO selection, fee estimation, and precise signature generation over strict binary layouts. Standard implementations often mix these concerns—fetching UTXOs from a node, mutating them in memory, signing them, and broadcasting them in a single unpredictable lifecycle.

**HardKAS introduces a deliberate architectural boundary:**
1. **Planning is isolated from signing.** A transaction is "planned" into a deterministic, portable JSON artifact.
2. **Key material is highly protected.** Private keys never cross serialization boundaries.
3. **Execution is independently verifiable.** Artifacts cryptographically commit to their lineage, meaning any stage of the lifecycle can be replayed and independently audited offline.

## Core Capabilities

- **Large Wallet Resilience:** Deterministic dust aggregation and UTXO consolidation (handling thousands of inputs) without OOM crashes.
- **Artifact Mutability Protection:** Structural and hashing rules that prevent mid-flight tampering of transactions.
- **Provider Agnostic:** Supports execution against simulated environments (for instant deterministic testing) and real `rusty-kaspad` JSON-RPC nodes.
- **Isomorphic Core:** `@hardkas/sdk` executes cleanly in Node.js and bundles natively into Vite/React frontends without pulling in server-side polyfills.

## Documentation Levels

Whether you are building a React wallet, a backend daemon, or auditing the system for security, these documents are structured to serve you:

- **Level 1 (New User):** See [Getting Started](./getting-started/installation.md) and [Quickstart](./getting-started/quickstart.md) for basic integration.
- **Level 2 (Developer):** Review the [Transaction Lifecycle](./concepts/transaction-lifecycle.md) and the [SDK Reference](./reference/sdk.md).
- **Level 3 (Maintainer/Auditor):** Read the [Invariants](./concepts/invariants.md), [Security Model](./concepts/security-model.md), and the [Capability Matrix](./certification/capability-matrix.md).

> [!NOTE]
> HardKAS **does not** replace Kaspa consensus. It is a strictly structured client-side orchestrator. The real network validation always happens at the `rusty-kaspad` RPC boundary.
