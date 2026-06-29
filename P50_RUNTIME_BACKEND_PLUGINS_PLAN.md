# P50 — Runtime Backend Plugins Plan

## Objective
Enable swapping HardKAS mock/local components with real backends (RPC nodes, real compilers, hardware wallets, databases) without altering the public API of the Toolkits.

## Scope
Based on Lab 15 frictions, Phase P50 will implement the foundational backend plugin architecture, starting with the `IndexerToolkit`.

### 1. Toolkit Configuration Updates
Toolkits will be updated to accept backend plugin configurations:
```ts
const indexer = await IndexerToolkit.open({
  backend: "rpc",
  plugin: kaspaRpcBackendPlugin("ws://127.0.0.1:18210")
});
```

### 2. Async Boot Sequences
Since real backends require asynchronous connections, Toolkit initialization must support async operations, or introduce an explicit `await toolkit.connect()` lifecycle method.

### 3. Store Dependency Injection
Toolkits must stop unconditionally instantiating local `ProjectionStoreJson` or `ArtifactIndexStoreJson` when an external plugin satisfies those data layers.

### 4. Method Delegation (Routing Layer)
Toolkit methods (`balance()`, `history()`, `findReceipts()`) will be refactored to check if a backend plugin handles the query. If a plugin exists, delegate to the plugin. If not, fallback to the local simulated store.

### 5. Snapshot Capability Flags
Plugins must declare if they support snapshots. If a backend connects to a real Kaspa node, `snapshot()` should become a no-op or return an external metadata reference, preserving the deterministic nature of local simulation without failing.

## Roadmap
1. Define the `HardkasBackendPlugin` base interface in `@hardkas/core`.
2. Implement the internal routing layer in `IndexerToolkit`.
3. Migrate `kaspaRpcBackendPlugin` prototype from Lab 15 into an official `@hardkas/plugin-rpc-backend` package.
4. Expand backend architecture to other components:
   - `SilverToolkit` -> Real Compiler Plugin
   - `DAG Toolkit` -> Real Consensus VM Plugin
   - `WalletToolkit` -> HSM / Ledger Plugin
