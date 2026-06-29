# P40.3 Indexer Toolkit Ready

`IndexerToolkit` has been implemented as an ergonomic facade.

## Design Constraints Met
- Pure composition: Wraps `ProjectionStoreJson` and `ArtifactIndexStoreJson` without introducing standalone data processing engines.
- Simplified Event Subscriptions: Exposes `watch()` which utilizes `EventSubscriber` logic via polling under the hood, deliberately avoiding Websockets for V1 as constrained.
- Ergonomics: Makes syncing receipts and balances across addresses trivial for high-level consumers like Oracles or background services.
