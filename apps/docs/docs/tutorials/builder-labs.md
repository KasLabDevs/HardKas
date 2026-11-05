---
title: Examples & Builder Labs
description: Reference applications, canonical examples (01-11), and production-grade Kaspa L1 Builder Labs powered by HardKAS.
sidebar_label: Examples & Builder Labs
sidebar_position: 1
---

# Examples & Builder Labs

HardKAS follows an **Application-First Philosophy**: every SDK primitive, UTXO planner policy, covenant builder, and CLI diagnostic originates from building real Kaspa Layer 1 software.

The repository includes two complementary layers of reference implementations:
1. **Progressive SDK Examples (`examples/01` – `examples/11`):** Focused, runnable TypeScript workflows teaching one core Kaspa L1 concept at a time.
2. **Production Builder Labs (`labs/`):** Full-featured reference architectures for wallets, merchant checkouts, offline PSKT custody, SilverScript covenants, and live indexers.

---

## 1. Progressive SDK Examples (`examples/`)

Every example in `examples/` runs deterministically against the local simulator or a managed `rusty-kaspa` (`kaspad --simnet`) node:

| Example | Directory | Core Kaspa L1 Capability Demonstrated | Run Command |
| :--- | :--- | :--- | :--- |
| **01. Hello Kaspa** | `examples/01-hello-kaspa` | Workspace initialization, execution target resolution, and deterministic account inspection | `pnpm example:hello` |
| **02. Basic Transfer** | `examples/02-basic-transfer` | UTXO selection, KIP-9 mass calculation, Schnorr signing, and receipt artifact emission | `pnpm example:transfer` |
| **03. Localnet Demo** | `examples/03-localnet-demo` | Booting a real `kaspad --simnet` node, mining maturity blocks, and broadcasting via wRPC | `pnpm example:localnet` |
| **04. Trace & Replay** | `examples/04-trace-and-replay` | Deterministic offline transaction replay (`TxPlan` → `SignedTx` → `TxReceipt`) | `pnpm example:trace` |
| **05. Snapshot & Restore** | `examples/05-snapshot-restore` | Capturing and restoring deterministic UTXO/DAG state snapshots for repeatable test fixtures | `pnpm example:snapshot` |
| **06. RPC Node Health** | `examples/06-rpc-node-health` | Live node diagnostics, DAA score tracking, sync validation, and endpoint resilience | `pnpm example:rpc-health` |
| **07. Transaction v1 Demo** | `examples/07-v1-demo` | Toccata v1 transaction fields, explicit compute budgets, and payload commitments | `pnpm example:v1-demo` |
| **08. Covenant Core** | `examples/08-covenant-core` | P2SH covenant locking, introspective output enforcement (`OP_TX_OUTPUT_*`), and spend verification | `pnpm example:covenant-demo` |
| **09. SilverScript Reference** | `examples/09-silver-reference` | Compiling `.sil` contracts with managed `silverc v1.0.0`, provenance verification, and entry spending | `hardkas silver compile` |
| **10. Covenant Dev Framework** | `examples/10-covenant-dev-framework` | Multi-step stateful covenants, lineage tracking, and adversarial mutation testing | `hardkas test` |
| **11. KCC-20 Token Covenant** | `examples/11-kcc20-token` | L1 covenant-enforced token minting, supply conservation, and transfer validation | `hardkas test` |

---

## 2. Canonical Builder Labs (`labs/`)

Builder Labs validate the full HardKAS stack (`@hardkas/sdk`, `@hardkas/toolkit`, `@hardkas/query-store`, `@hardkas/pskt-native`, `@hardkas/tx-builder`) under realistic operational load:

### Protocol & Custody Labs
- **`labs/bl-001-offline-multisig` — Air-Gapped PSKT Multisig:** Demonstrates multi-party Partially Signed Kaspa Transactions (`@hardkas/pskt-native`), SIGHASH validation, and offline co-signing without exposing private keys to network hosts.
- **`labs/bl-002-escrow-multisig` — 2-of-3 Escrow Covenant:** Implements conditional release and timeout recovery using deterministic script verification and auditable evidence packages.
- **`labs/bl-003-silverscript-covenant` — Stateful SilverScript Vault:** Compiles `.sil` contracts via `silverc`, executes 1:1 auth-bound covenant genesis and state transitions (`hardkas silver covenant genesis` / `transition`), and verifies lineage on `simnet`.
- **`labs/02-merchant-checkout` — Instant BlockDAG Checkout:** Handles invoice address derivation, mempool-aware UTXO detection, DAA confirmation tracking, and automated settlement receipts.
- **`labs/exchange-backend` & `labs/treasury` — Institutional Custody & Consolidation:** Demonstrates hot-to-cold UTXO sweeping, coin-selection policies, background job queues (`@hardkas/jobs`), and SQLite/PostgreSQL persistence.

### Interactive Showcase Suite (`labs/showcase-suite/apps/`)
Full-stack reference applications pairing `@hardkas/sdk` + `@hardkas/toolkit` backends with `@hardkas/client` + `@hardkas/react` frontends:
- **`wallet-pro`** — HD wallet management, UTXO coin control, and fee-mass preview.
- **`merchant-terminal`** — Point-of-sale payment processor with live DAG confirmation streaming.
- **`explorer-live`** — Local BlockDAG, transaction, and artifact lineage explorer.
- **`silver-playground`** — Interactive SilverScript & Covenant compilation/simulation studio.
- **`time-travel-lab`** — Deterministic snapshot branching and state replay debugger.
- **`localnet-studio` & `mission-control`** — Multi-node orchestration and chaos/telemetry monitoring.
- **`treasury-console` & `cli-studio`** — Multi-sig governance and browser-based command runner.

---

## 3. Inspecting & Verifying a Lab Workspace

Before running any Builder Lab, verify your local toolchain and environment health:

```bash
hardkas doctor --json
hardkas config networks
hardkas config show --json
```

Sample output:

```text
HardKAS Doctor

  ✅ Node.js v24.22.1 (≥ 22.5 required)
  ✅ pnpm 9.15.4
  ✅ .hardkas/ exists
  ✅ .gitignore protects .hardkas/
  ✅ silverc v1.0.0 ready
  ✅ kaspad simnet reachable

  Summary: 6 passed, 0 failed, 0 warnings
```

---

## 4. Indexing & Auditing Lab Artifacts (`@hardkas/query-store`)

Every transaction executed by a Builder Lab emits cryptographic artifacts that can be indexed into the local SQLite read model and audited offline:

```bash
hardkas query store sync --strict --json
hardkas query artifacts list --sort createdAt:desc --limit 20
hardkas query artifacts inspect <artifactId> --explain full
hardkas query lineage chain <artifactId> --why
```

Sample output:

```text
Query store sync
  Indexed artifacts: 42
  New records:       3
  Strict mode:       passed

Latest artifacts
  tx-plan     sha256:91ab...
  signed-tx   sha256:2f7c...
  receipt     sha256:19ed...

Lineage
  TxPlan → SignedTx → Receipt → ReplayCheck
```

### Query Store Diagnostics & Event Tracing

```bash
hardkas query store doctor --migrate
hardkas query events --domain tx --limit 10
hardkas query tx <txId> --explain full
```
