# HardKAS Operator Getting Started Guide

This guide details how to initialize, plan, and verify transaction workflows in a local simulated environment.

---

## 1. Installation & Scaffolding

Ensure you are inside your project folder, then run the initialization command:

```bash
# Initialize a fresh HardKAS workspace named demo
hardkas init demo
cd demo
```

This creates the canonical `.hardkas/` directory scaffold.

---

## 2. Funding Simulated Accounts

Before planning simulated transfers, fund virtual local accounts:

```bash
# Fund Alice with 1000 KAS
hardkas accounts fund alice --amount 1000
```

This updates the virtual localnet UTXO set deterministically.

---

## 3. Planning & Sending Transactions

Plan and execute a deterministic transaction:

```bash
# Send 10 KAS from Alice to Bob in simulated mode
hardkas tx send \
  --network simulated \
  --from alice \
  --to bob \
  --amount 10 \
  --yes
```

This writes the transaction plan (`txPlan`) and execution receipt (`txReceipt`) deterministically to `.hardkas/`.

---

## 4. Verifying Lineage (Replay)

Verify that the generated receipts match the causal state timeline:

```bash
# Replay and verify the workspace state
hardkas replay verify .
```

If the state matches the invariants perfectly, the console reports `VERIFIED`.
