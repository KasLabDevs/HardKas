# Lab 09 — Full App Rebuild Functional

## Objective
To rebuild the entire ecosystem (Wallet, Merchant, Explorer, Oracle, and Batch) using only the newly extracted `@hardkas/toolkit` and `@hardkas/jobs` abstractions, strictly forbidding any imports of internal helpers like `ProjectionStoreJson`, `EventSubscriber`, or `WalletManagerImpl`.

## Success Metrics

1. **Imports Reduced**:
   - **Before (Lab 08)**: 6+ infrastructure classes (`ProjectionStoreJson`, `ArtifactIndexStoreJson`, `EvidenceBatchExporter`, `EventSubscriber`, etc.).
   - **After (Lab 09)**: Only 4 high-level domain imports (`WalletToolkit`, `PaymentToolkit`, `IndexerToolkit`, `JobRunner`).

2. **Code Simplification**:
   - **Initialization**: 12+ lines of complex wiring in Lab 08 were reduced to 5 declarative lines of toolkit initialization.
   - **Ergonomics**: Endpoints now read like plain English:
     - `await payment.createInvoice(...)`
     - `await wallet.sendSimulated(...)`
     - `await indexer.balance(...)`
     - `await indexer.ingestArtifact(...)`
     - `await jobs.enqueue('reconcile', ...)`

3. **Abstractions Maintained**:
   - Zero internal concepts (e.g. `WalletManagerImpl`, `ArtifactIndexStoreJson`) leaked into the application logic.

## Frictions Discovered
As documented in `TOOLKIT_FRICTIONS.md`, the primary missing piece is **Domain State Persistence**. Because toolkits act strictly as facades, `PaymentToolkit` lacks an integrated way to persist and query invoices, forcing us to use an in-memory `Map` in `server.ts` to satisfy the Oracle API requirements.

## Conclusion
The Toolkit layer successfully proves that HardKAS feels like a mature framework. Developers can now focus on application logic using declarative APIs, while the framework handles the heavy lifting of deterministic execution, artifacts, and projections under the hood.

The framework is now ready for stabilization, documentation, and addressing the state management frictions discovered in this laboratory.
