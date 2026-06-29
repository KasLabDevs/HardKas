# Release Notes — HardKAS 0.11.0-alpha (Toolkit Baseline)

## Overview

HardKAS 0.11.0-alpha marks the **Toolkit Baseline** release — the first version where developers can build complete Kaspa applications using only the `@hardkas/toolkit` facade, without importing internal helpers.

This release was shaped entirely by real applications (Labs 01–09.5), following HardKAS's core principle: **applications define the SDK**.

---

## Highlights

### Toolkit Layer (`@hardkas/toolkit`)
A high-level facade that composes all internal SDK helpers into four ergonomic APIs:

- **`WalletToolkit.open(name, opts)`** — Create wallets, check balances, send (simulated)
- **`PaymentToolkit.openMerchant(name, opts)`** — Create invoices, generate Kaspa URIs, produce receipts, query stats
- **`IndexerToolkit.open(opts)`** — Watch addresses, query balances, ingest and search artifacts
- **`JobsToolkit.open(opts)`** — Register handlers, enqueue jobs, track progress and checkpoints

### Jobs System (`@hardkas/jobs`)
A local-first job runner with no external dependencies (no Redis, no BullMQ):
- `JobRunner` with `registerHandler` / `enqueue` / `getJob`
- `JobStoreJson` for persistent job state
- `ProgressReporter`, `JobCheckpoint`, `RetryPolicy`, `BatchCursor`
- Job states: `pending`, `running`, `completed`, `failed`, `retrying`

### Domain State (`@hardkas/query-store`)
- `DomainStoreJson<T>` — Generic, domain-agnostic persistence primitive
- `InvoiceStoreJson` — Domain-aware store for payment invoices

### Official Templates
Available via `hardkas create --template <name>`:
- `wallet-backend`
- `merchant-checkout`
- `payment-service`
- `full-stack-demo`

### Builder Book v2
8 chapters following the real development journey:
1. What is HardKAS
2. Wallet App
3. Merchant Checkout
4. Payment Service
5. Toolkit Layer
6. Jobs
7. Evidence
8. Full Stack Demo

---

## Package Inventory (26 packages)

| Package | Version |
|---|---|
| `@hardkas/accounts` | 0.11.0-alpha |
| `@hardkas/artifacts` | 0.11.0-alpha |
| `@hardkas/bridge-local` | 0.11.0-alpha |
| `@hardkas/cli` | 0.11.0-alpha |
| `@hardkas/client` | 0.11.0-alpha |
| `@hardkas/config` | 0.11.0-alpha |
| `@hardkas/core` | 0.11.0-alpha |
| `@hardkas/dev-server` | 0.11.0-alpha |
| `@hardkas/jobs` | 0.11.0-alpha |
| `@hardkas/kaspa-rpc` | 0.11.0-alpha |
| `@hardkas/l2` | 0.11.0-alpha |
| `@hardkas/localnet` | 0.11.0-alpha |
| `@hardkas/node-orchestrator` | 0.11.0-alpha |
| `@hardkas/node-runner` | 0.11.0-alpha |
| `@hardkas/plugin-local-indexer` | 0.11.0-alpha |
| `@hardkas/query` | 0.11.0-alpha |
| `@hardkas/query-store` | 0.11.0-alpha |
| `@hardkas/react` | 0.11.0-alpha |
| `@hardkas/sdk` | 0.11.0-alpha |
| `@hardkas/sessions` | 0.11.0-alpha |
| `@hardkas/simulator` | 0.11.0-alpha |
| `@hardkas/simulator-adapters` | 0.11.0-alpha |
| `@hardkas/testing` | 0.11.0-alpha |
| `@hardkas/toolkit` | 0.11.0-alpha |
| `@hardkas/tx-builder` | 0.11.0-alpha |
| `@hardkas/wallet-adapter` | 0.11.0-alpha |

---

## Release Hardening

All five gauntlet checks pass with exit code 0:

| Check | Result |
|---|---|
| `pnpm build` | ✅ 35/35 packages |
| `pnpm test` | ✅ exit 0 |
| `pnpm docs:verify-book` | ✅ 22 blocks, 8 chapters |
| `pnpm templates:verify` | ✅ 3/3 templates with evidence |
| `pnpm packaging:smoke` | ✅ 26 tarballs, no workspace:* leaks |

---

## Breaking Changes
None. This is the first Toolkit Baseline release.

## Known Limitations
- Toolkits operate in simulated/local-first mode. No live mainnet broadcast.
- `IndexerToolkit.watch()` uses event subscriber polling, not websockets.
- `WalletToolkit.send()` is `sendSimulated()` — no real broadcast in V1.
- No SQLite persistence yet — all stores use JSON files.
