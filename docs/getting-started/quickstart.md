# Quickstart

The fastest way to feel HardKAS is deterministic `simulated` mode. It does not
need Docker, a Kaspa node, faucet funds, or network access.

## 1. Initialize A Workspace

```bash
hardkas init .
```

This creates `hardkas.config.ts`, `.hardkas/`, and default simulated accounts
such as `alice` and `bob`.

## 2. Run The One-Command Local Transfer

```bash
hardkas tx send --from alice --to bob --amount 10 --network simulated --yes
```

This performs the full local lifecycle:

```txt
plan -> sign -> simulate -> receipt
```

## 3. Open The Dashboard

```bash
hardkas dashboard
```

The dashboard reads the same `.hardkas` workspace and shows transactions,
artifacts, replay status, events, and lineage.

## 4. Run The Explicit Artifact Flow

Use this when you want to inspect the boundary before signing:

```bash
hardkas tx plan --from alice --to bob --amount 10 --network simulated --out tx-plan.json
hardkas artifact inspect tx-plan.json
hardkas artifact verify tx-plan.json --strict
hardkas tx sign tx-plan.json --account alice --out tx-signed.json
hardkas tx send tx-signed.json --network simulated --yes
```

`tx-plan.json` and `tx-signed.json` are local artifacts and should not be
committed.

## 5. Rebuild And Query

If the SQLite projection is stale, rebuild it from artifacts:

```bash
hardkas query store sync
hardkas query store doctor
```

The filesystem artifacts remain the source of truth.
