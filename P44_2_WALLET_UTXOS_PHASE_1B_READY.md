# Phase 1B Certificate: Wallet UTXOs (P44.2)

This certifies that **Phase 1B** of the `0.11.1-alpha` UTXO Toolkit roadmap has been completed and formally integrated into the `@hardkas/toolkit` API surface.

## Validated Capabilities
The `WalletUtxoApi` successfully implements fine-grained transaction planners without polluting the core `WalletToolkit` facade, exposing:
- `wallet.utxos.splitPlan(opts)`
- `wallet.utxos.mergePlan(opts)`
- `wallet.utxos.sweepPlan(opts)`

All planners are guaranteed to be side-effect free (no state mutation, no transaction broadcasting), adhering to the HardKAS deterministic philosophy.

## Type System Consolidation
The public types for `0.11.1-alpha` UTXO features are strict and stabilized:
- `SplitPlan`
- `MergePlan`
- `SweepPlan`

## Checkpoints Passed
- [x] Planners implemented in `WalletUtxoApi`.
- [x] Lab 10 refactored to consume and test the new planners.
- [x] API documentation updated (Builder Book Chapter 09).
- [x] Code examples committed (`docs/examples/api/wallet-utxos.ts`).
- [x] Monorepo gauntlet checks (Build + Test).

**Status**: READY FOR PHASE 1C (Coin Control State).
