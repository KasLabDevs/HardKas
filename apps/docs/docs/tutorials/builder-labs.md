---
title: Examples & Builder Labs
---

_Builder Labs — coming from the existing examples and reference workflows._

Showcase of reference examples and workshops powered by HardKAS: Wallet backends, Checkout systems, Local indexers, etc.

Inspect local environment

**diagnostics Copy**

```typescript
hardkas doctor --json
hardkas capabilities --json
hardkas networks --json
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

**sample output (truncated)**

```typescript
{
  "version": "0.12.0-rc.23",
  "maturity": "hardened-alpha",
  "capabilities": {
    "artifacts": true,
    "deterministicHashing": true,
    "workspaceLocks": true,
    "consensusValidation": false,
    "silverScript": false
  }
}
```

Create and inspect an L2 transaction plan

**l2 tx Copy**

```typescript
hardkas l2 tx build --network igra --from 0x... --to 0x... --value 0 --data 0x --json
hardkas l2 tx sign ./artifacts/l2-plan.json --account bob --json
hardkas l2 tx send ./artifacts/l2-signed.json --yes --json
hardkas l2 tx receipt <txHash> --json
```

**sample output**

```typescript
L2 transaction plan:
  Network: igra
  From:    0xbob...
  To:      0xreceiver...
  Value:   0
  Status:  planned

Signed artifact:
  Artifact: l2-signed-tx
  Hash:     sha256:8f2c...

Send result:
  Status: accepted
  TxHash: 0xa1b2c3d4e5f6...
```

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
