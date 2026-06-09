# CLI Guide

The HardKAS CLI (`hardkas` or `npx hardkas`) is the main local developer
interface. The generated command reference currently exposes 197 commands, but
the happy path is intentionally small.

## 1. Local Transaction Lifecycle

Shortcut flow:

```bash
hardkas tx send --from alice --to bob --amount 10 --network simulated --yes
```

Explicit artifact flow:

```bash
hardkas tx plan --from alice --to bob --amount 10 --network simulated --out tx-plan.json
hardkas artifact inspect tx-plan.json
hardkas artifact verify tx-plan.json --strict
hardkas tx sign tx-plan.json --account alice --out tx-signed.json
hardkas tx send tx-signed.json --network simulated --yes
```

## 2. Accounts

```bash
hardkas accounts list
hardkas accounts balance alice --network simulated
hardkas accounts fund alice --amount 1000
```

`accounts fund` is for development networks. Do not use HardKAS as a production
mainnet wallet.

## 3. Artifacts

```bash
hardkas artifact inspect tx-plan.json
hardkas artifact verify tx-plan.json --strict
hardkas artifact lineage tx-signed.json
hardkas artifact explain tx-signed.json
```

Artifacts are the audit boundary between planning, signing, sending, replay, and
dashboard visibility.

## 4. Query Store

```bash
hardkas query store sync
hardkas query store doctor
hardkas query artifacts list
hardkas query lineage chain <artifact_id>
```

The query store is a rebuildable SQLite projection. If it drifts, rebuild it
from canonical filesystem artifacts.

```bash
hardkas query store rebuild
```

## 5. Replay And Diagnostics

```bash
hardkas replay verify
hardkas verify --deep
hardkas verify-semantics
hardkas doctor
hardkas dashboard
```

Use `verify --deep` for workspace-level integrity and `artifact verify --strict`
for a specific artifact or directory.
