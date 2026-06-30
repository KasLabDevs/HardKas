# Wallet Service Reference Ready

The **Wallet Service** (P59 - App 2) is successfully validated in `examples/reference-apps/wallet-service`.

## Achievements
- Generated 100 `WalletToolkit` instances handling 10,000+ controlled UTXOs.
- Proved large-scale UTXO management public APIs (`splitPlan`, `mergePlan`, `sweepPlan`).
- Simulated mass Coin Control strategies with labels, notes, and strict exclusion of frozen coins.
- Orchestrated state ingestion via `SyncDaemon`.
- Used `SnapshotToolkit` seamlessly to capture wallet states.
- 0 unhandled rejections during the simulation.
- Generated `wallet-service.evidence.json`.

## Frictions Identified & Solved
- `WalletToolkit` previously hid a hardcoded mock `WalletQuery` backend, forcing developers to use internal APIs (`as any`) to ingest fixtures.
- This was resolved directly in `@hardkas/toolkit` by allowing `provider?: WalletQueryProvider` to be passed into `WalletToolkitOptions`.
- This ensures developers can simulate and test multi-wallet apps natively using public API endpoints.
- Validated via `pnpm check:imports` (0 internal imports).

The framework is proving incredibly capable. Ready to proceed to App 3.
