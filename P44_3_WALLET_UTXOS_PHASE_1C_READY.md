# Phase 1C Certificate: Wallet UTXOs (P44.3)

This certifies that **Phase 1C** of the `0.11.1-alpha` UTXO Toolkit roadmap has been completed, tested, and integrated.

## Validated Capabilities

The Toolkit now supports **Coin Control State**, introducing persistent, local state management for UTXOs:
- **`freeze(utxoId, reason?)`**: Excludes the UTXO from diagnostics and automated planners.
- **`unfreeze(utxoId)`**: Restores availability.
- **`labels.set/get`**: Allows tagging UTXOs with string identifiers.
- **`notes.set/get`**: Allows attaching freeform metadata.
- **`controlState()`**: Returns the full state of local coin control.

The state is persisted locally inside the `.hardkas/` directory using the new `UtxoControlStore`.

## Checkpoints Passed
- [x] Planners (`splitPlan`, `mergePlan`, `sweepPlan`, `consolidate`) exclude frozen UTXOs by default.
- [x] Diagnostics (`list`, `statistics`, `analyze`, `analyzeDust`) exclude frozen UTXOs by default but can include them using `includeFrozen: true`.
- [x] Diagnostics separate values into `availableUtxos` and `frozenUtxos`.
- [x] Lab 10 refactored to test freezing, exclusion, unfreezing, labels, and notes.
- [x] Documentation updated (Builder Book Chapter 09 & `wallet-utxos.ts` example).
- [x] Monorepo gauntlet checks (Build + Test).

**Status**: UTXO Toolkit `0.11.1-alpha` implementation is complete. Ready for DAG Toolkit.
