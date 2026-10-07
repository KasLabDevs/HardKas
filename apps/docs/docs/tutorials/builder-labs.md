---
title: Examples & Builder Labs
---

_Builder Labs — coming from the existing examples and reference workflows._

Showcase of reference examples and workshops powered by HardKAS: Wallet backends, Checkout systems, Local indexers, etc.

Inspect local environment

**diagnostics Copy**

```typescript
hardkas doctor --json
hardkas config networks
hardkas config show --json
```

**sample output**

```typescript
HardKAS Doctor

  ✅ Node.js v22.5.0 (≥ 22.5 required)
  ✅ pnpm 9.1.0
  ✅ .hardkas/ exists
  ✅ .gitignore protects .hardkas/
  ⚠️ store.db not found (run hardkas query store rebuild)
  ✅ No stale locks
  ❌ Docker not reachable
  ⏭️ RPC check skipped (no node running)

  Summary: 5 passed, 1 failed, 1 warning, 1 skipped
```

L2 transactions (Igra) are not part of the HardKAS L1 CLI: the `l2` command group belongs to the Igra Lab and the L1 CLI does not register it.

Index and explain artifacts

**query Copy**

```typescript
hardkas query store sync --strict --json
hardkas query artifacts list --sort createdAt:desc --limit 20
hardkas query artifacts inspect <artifactId> --explain full
hardkas query lineage chain <artifactId> --why
```

**sample output**

```typescript
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

SQLite query store diagnostics and event tracing

**query store Copy**

```typescript
hardkas query store doctor --migrate
hardkas query events --domain tx --limit 10
hardkas query tx 0xa1b2... --explain full
```

**sample output**

```typescript
Store Doctor:
  Migrations:  up to date
  Schema:      v4
  Health:      passed

Tx Explain:
  TxId:       0xa1b2...
  Domain:     tx
  Events:     [PlanCreated, Signed, Broadcast, ReceiptObserved]
  Lineage:    Plan → Signature → RPC
  Replay:     Deterministic match
```
