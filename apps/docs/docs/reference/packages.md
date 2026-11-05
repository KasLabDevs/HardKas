---
title: Package Map
description: Complete directory of packages in the HardKAS monorepo organized by architectural layer.
---

# Package Map

For standard application development, you only need to install **`@hardkas/cli`** (for terminal workflows) and **`@hardkas/sdk`** (for TypeScript integration), plus **`@hardkas/react`** if building a web frontend. All underlying primitives are composed automatically.

---

## 1. Primary Developer Entrypoints

| Package | Layer | Purpose |
| :--- | :---: | :--- |
| `@hardkas/sdk` | L2 | Unified TypeScript SDK for transactions, SilverScript (`silverc`), Covenants, ZK verification, localnet, and queries |
| `@hardkas/cli` | L4 | The `hardkas` command-line interface and workflow runner |
| `@hardkas/testing` | L3 | Deterministic scenario runner, assertions, and fuzz/chaos testing utilities |
| `@hardkas/client` | L0 | Lightweight browser-safe HTTP/SSE client |
| `@hardkas/react` | L4 | React hooks and providers for Kaspa L1 web applications |

---

## 2. Core Kaspa L1 Primitives & Execution Engines

| Package | Layer | Purpose |
| :--- | :---: | :--- |
| `@hardkas/core` | L0 | Canonical types, branded primitives, network constants, and error taxonomy |
| `@hardkas/config` | L0.5 | `hardkas.config.ts` parser, schema validation, and execution target resolution |
| `@hardkas/tx-builder` | L1 | UTXO coin selection, KIP-9 mass/fee calculator, Covenant & SilverScript builders, and ZK script construction |
| `@hardkas/pskt-native` | L0 | Native Rust NAPI bindings for Partially Signed Kaspa Transactions (PSKT) |
| `@hardkas/artifacts` | L1 | Cryptographically hashed artifacts (`TxPlan`, `SignedTx`, `TxReceipt`) and Evidence Packages |
| `@hardkas/accounts` | L1 | HD wallet key derivation, local keystore management, and signing authority guards |
| `@hardkas/simulator` | L1 | Instant, deterministic in-memory BlockDAG and Kaspa Script execution engine |
| `@hardkas/kaspa-rpc` | L1 | Resilient wRPC / JSON-RPC client for `rusty-kaspa` (`kaspad`) nodes |
| `@hardkas/node-runner` | L1 | Managed `kaspad` binary/container runner and health supervisor |
| `@hardkas/node-orchestrator` | L1 | Multi-node BlockDAG topology, partition, and latency orchestrator |
| `@hardkas/localnet` | L1 | Unified localnet controller bridging `simulator` and `kaspad --simnet` |

---

## 3. Indexing, Backend Services & Storage

| Package | Layer | Purpose |
| :--- | :---: | :--- |
| `@hardkas/query-store` | L3 | SQLite read-model index for artifacts, events, and lineage graphs |
| `@hardkas/query` | L3 | High-level query engine over `@hardkas/query-store` and workspace artifacts |
| `@hardkas/toolkit` | L3 | Backend application kit combining UTXO reservation, RPC resilience, queries, and jobs |
| `@hardkas/sync-daemon` | L3 | Continuous BlockDAG synchronization and UTXO indexing daemon |
| `@hardkas/jobs` | L3 | Asynchronous job queue and retry engine for transaction pipelines |
| `@hardkas/storage-sqlite` | L3 | SQLite persistence adapter for `@hardkas/toolkit` backends |
| `@hardkas/storage-postgres` | L3 | PostgreSQL persistence adapter for production `@hardkas/toolkit` backends |
| `@hardkas/observability` | L0 | Structured JSON logging, metrics, and telemetry tracing |
| `@hardkas/wallet-adapter` | L3 | External wallet connection boundary and signing adapters |
| `@hardkas/dev-server` | L4 | Headless Hono HTTP/SSE developer server (`hardkas sandbox`) |
