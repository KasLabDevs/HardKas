---
title: Architecture & Dependency Graph
description: Layered architecture and package dependency graph of the HardKAS Kaspa L1 framework.
---

# Architecture & Dependency Graph

HardKAS enforces a strict 5-layer Directed Acyclic Graph (DAG) across its packages so that lower-level protocol primitives never depend on higher-level orchestration or UI layers, and browser frontends remain isolated from Node.js server dependencies.

```mermaid
flowchart TD
    subgraph L0["Level 0: Foundations (Zero internal dependencies)"]
        CORE["@hardkas/core"]
        OBS["@hardkas/observability"]
        CLIENT["@hardkas/client"]
        PSKT["@hardkas/pskt-native"]
    end

    subgraph L1["Level 1: Core Kaspa L1 Primitives & Execution Worlds"]
        CFG["@hardkas/config"]
        TXB["@hardkas/tx-builder"]
        RPC["@hardkas/kaspa-rpc"]
        ART["@hardkas/artifacts"]
        SIM["@hardkas/simulator"]
        NRUN["@hardkas/node-runner"]
        ORCH["@hardkas/node-orchestrator"]
        LNET["@hardkas/localnet"]
        ACC["@hardkas/accounts"]
    end

    subgraph L2["Level 2: Composition & Product API"]
        SDK["@hardkas/sdk"]
    end

    subgraph L3["Level 3: Indexing, Backend Toolkit & Extensions"]
        QSTORE["@hardkas/query-store"]
        QUERY["@hardkas/query"]
        JOBS["@hardkas/jobs"]
        TOOLKIT["@hardkas/toolkit"]
        SQLITE["@hardkas/storage-sqlite"]
        PG["@hardkas/storage-postgres"]
        SYNC["@hardkas/sync-daemon"]
        WADAPT["@hardkas/wallet-adapter"]
        TESTING["@hardkas/testing"]
    end

    subgraph L4["Level 4: CLI & Frontend Presentation"]
        DEVSRV["@hardkas/dev-server"]
        CLI["@hardkas/cli"]
        REACT["@hardkas/react"]
    end

    CORE --> CFG & TXB & RPC & ORCH
    OBS --> RPC & JOBS
    TXB --> ART & SIM & WADAPT
    RPC --> NRUN & WADAPT
    ART --> QSTORE
    QSTORE --> QUERY
    SIM & RPC & ART & TXB --> LNET
    LNET & CFG & ART & TXB --> ACC
    ACC & ART & JOBS & OBS & RPC & QUERY & QSTORE & TXB --> TOOLKIT
    TOOLKIT & JOBS --> SQLITE & PG
    TOOLKIT & OBS --> SYNC
    ACC & CFG & LNET & QUERY & QSTORE & SIM & TOOLKIT & NRUN --> SDK
    SDK & SIM & NRUN --> TESTING
    SDK --> DEVSRV
    DEVSRV & TESTING & ORCH & QUERY --> CLI
    CLIENT --> REACT
```

---

## Layer Responsibilities

### Level 0 — Foundations
- **`@hardkas/core`**: Canonical types, branded identifiers (`TxId`, `ArtifactId`, `KaspaAddress`), error taxonomy, and cryptographic hashing.
- **`@hardkas/observability`**: Structured logging, correlation IDs, and telemetry streams.
- **`@hardkas/client`**: Zero-dependency HTTP/SSE client for browser environments.
- **`@hardkas/pskt-native`**: Native Rust NAPI bindings for Partially Signed Kaspa Transactions (PSKT). On hold and not published; `@hardkas/sdk` does not depend on it.

### Level 1 — Core Primitives & Execution Worlds
- **`@hardkas/config`**: Workspace configuration loader (`hardkas.config.ts`) and execution target resolution.
- **`@hardkas/tx-builder`**: UTXO selection, KIP-9 mass calculation (Compute, Storage, and Transient mass), Schnorr signing, SilverScript/Covenant script builders, and ZK precompile script construction.
- **`@hardkas/artifacts`**: Immutable schemas and SHA-256 lineage verification for `TxPlan`, `SignedTx`, `TxReceipt`, and Evidence Packages.
- **`@hardkas/kaspa-rpc`**: Resilient wRPC / JSON-RPC client for `rusty-kaspa` (`kaspad`) nodes.
- **`@hardkas/simulator`**: Deterministic in-memory BlockDAG and Kaspa Script VM for instant unit testing.
- **`@hardkas/node-runner` & `@hardkas/node-orchestrator`**: Managed `kaspad` binary lifecycle and multi-node DAG topology orchestration.
- **`@hardkas/localnet`**: Unified local execution engine bridging the in-memory simulator and real `kaspad --simnet` nodes.
- **`@hardkas/accounts`**: HD wallet derivation, keystore encryption, and execution-mode authority guards.

### Level 2 — Composition & Product API
- **`@hardkas/sdk`**: The primary developer facade unifying transaction planning, SilverScript (`sdk.silver`), covenants (`sdk.covenants`), ZK verification (` verifyZkProofMath`, `buildR0Groth16Scripts`), localnet control, and querying.

### Level 3 — Indexing, Backend Toolkit & Testing
- **`@hardkas/query-store` & `@hardkas/query`**: Read-only SQLite projection of artifacts, UTXOs, and lineage chains.
- **`@hardkas/toolkit`, `@hardkas/jobs`, `@hardkas/sync-daemon`, `@hardkas/storage-sqlite`, `@hardkas/storage-postgres`**: Production backend primitives for building indexers, merchant checkouts, and custody services.
- **`@hardkas/wallet-adapter`**: Browser and hardware wallet connection adapters.
- **`@hardkas/testing`**: Scenario runner, chaos engine, and reproducible assertion helpers.

### Level 4 — Presentation
- **`@hardkas/cli`**: The `hardkas` command-line interface.
- **`@hardkas/dev-server`**: Local HTTP/SSE developer API server backing `hardkas sandbox`.
- **`@hardkas/react`**: Zero-bloat React hooks (`@hardkas/client` consumer) for Kaspa frontends.
