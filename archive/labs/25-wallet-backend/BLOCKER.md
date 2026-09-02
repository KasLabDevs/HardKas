# Phase 9: Wallet Backend Lab — Blocker

Status: RESOLVED BY CONTRACT
Resolution:
Application Ownership / Optimistic Concurrency

No SDK reservation mechanism required by current evidence.

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
The SDK cannot guarantee conflict-free concurrent transaction plans when multiple planners observe the same spendable UTXO state before either spend becomes visible in mempool. Coordination between competing send intents is currently outside the planner contract.

## Status
**CONCURRENCY CHARACTERIZATION IN PROGRESS**

- **W2**: Confirmed concurrent plans may select the same outpoint.
- **W3 controlled**: Confirmed application/SDK flow can represent one accepted submission and one INPUT_CONFLICT without silent replan, false receipt, or state corruption.
- **Pending**: Real localnet same-process W3. Cross-process W2/W3 qualification.

No reservation mechanism approved.
