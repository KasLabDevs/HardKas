# Phase 9: Wallet Backend Lab — Blocker

**Condition Triggered**: W2 (Concurrent Planner Collision - Read Only) revealed reproducible UTXO collisions.

## Description
During the execution of W2 (`w2-concurrent-plan.test.ts`), we triggered two `hk.tx.plan` requests concurrently. Since the SDK planner (`TxPlanService`) reads UTXO state from the provider statelessly and applies no locking, both planners read the exact same authoritative UTXO state.

As a result, both Plan A and Plan B deterministically selected the exact same underlying UTXO (`0000000000000000000000000000000000000000000000000000000000000001:0`), despite not submitting the transaction.

## Evidence

```json
[W2] Plan A selected outpoints: [
  '0000000000000000000000000000000000000000000000000000000000000001:0'
]
[W2] Plan B selected outpoints: [
  '0000000000000000000000000000000000000000000000000000000000000001:0'
]
[W2] Collision occurred? true
[W2] BLOCKER IDENTIFIED: The planner is stateless and read-only. Concurrent requests successfully planned over the same authoritative UTXO state.
```

## Implication
Without an application-level ledger, the SDK cannot safely build concurrent transaction plans for a wallet backend. If these plans are executed, one of them will inevitably result in a double-spend rejection by the network or mempool conflict.

## Status
Phase 9 is BLOCKED pending resolution of this architectural gap (e.g. implementing SDK-native UTXO reservations or locks).
