---
title: How to Plan a Transaction
sidebar_position: 1
---

# How to Plan a Transaction

This guide demonstrates how to construct a deterministic `TxPlanArtifact` across different environments.

## Simulator Plan

To plan a transaction against the local deterministic Simulator:

```bash
hardkas tx plan \
  --from alice \
  --to bob \
  --amount 10 \
  --network simulated \
  --out my-plan.json
```

**Key Behaviors:**
- HardKAS discovers synthetic UTXOs from `.hardkas/localnet.json`.
- The planner authority is recorded as `SYNTHETIC_SIMULATOR`.
- Maturity filtering is bypassed.

## Real Node (Localnet) Plan

To plan a transaction against a real Kaspa node running locally via Docker:

```bash
hardkas tx plan \
  --from alice \
  --to bob \
  --amount 10 \
  --network simnet \
  --out my-plan.json
```

**Key Behaviors:**
- HardKAS queries the node via JSON-RPC.
- HardKAS enforces **Maturity Filtering** (+10 DAA blocks margin for coinbase UTXOs).
- HardKAS enforces **Virtual State Fingerprinting** to ensure the DAG did not shift during UTXO discovery.
- HardKAS excludes pending spends registered in the local workspace.

## Explicit Change Address (Advanced)

If you need the remaining unspent funds to be routed to a cold wallet or a fresh address instead of returning to the sender:

```bash
hardkas tx plan \
  --from alice \
  --to bob \
  --amount 10 \
  --change-address kaspa:qr... \
  --out my-plan.json
```

*Note: HardKAS will strictly validate that the `change-address` matches the target network of the transaction.*
