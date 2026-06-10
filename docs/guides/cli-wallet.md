# CLI Wallet Guide

## 1. Setup

Initialize your workspace:

```bash
hardkas init .
```

## 2. Check Balances

```bash
hardkas query store doctor
hardkas accounts list
```

## 3. Transfer

```bash
hardkas tx plan --from kaspa:sim_alice --to kaspa:sim_bob --amount 50
hardkas tx sign .hardkas/artifacts/txPlan-*.json --account kaspa:sim_alice
hardkas tx send .hardkas/artifacts/signedTx-*.json
```
