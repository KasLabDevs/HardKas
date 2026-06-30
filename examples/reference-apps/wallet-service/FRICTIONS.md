# Framework Frictions Discovered

During the implementation of App 2 (Wallet Service), the following architectural frictions were discovered:

## 1. `WalletToolkit` Hardcodes a Dummy `WalletQuery`
**Description**: The `WalletToolkit` constructor currently hardcodes `this.walletQuery = new WalletQuery({} as any);`. When a developer attempts to call `wallet.utxos.list()` or `wallet.utxos.statistics()`, the internal query crashes with `TypeError: Cannot read properties of undefined (reading 'source')` because it has no indexer attached.
**Workaround Used in Labs**: Previously, labs bypassed the public API and injected mocks directly using `(wallet as any).walletQuery.getUtxos = async () => mockUtxos;`.
**Resolution**: Under the 0.12-beta rules, no internal workarounds are allowed. The framework must be updated. We will modify `WalletToolkitOptions` in `@hardkas/toolkit` to accept an `indexer` instance, and pass it to `WalletQuery` so that the wallet can genuinely query the network state.

## 2. `SnapshotToolkit` Snapshot Backend Directory Initialization
**Description**: When calling `SnapshotToolkit.open({ backend: "filesystem", dir: ".hardkas/snapshots" })`, the underlying `FsSnapshotBackend` throws an error or fails to return a valid snapshot ID if the directory structure doesn't exist.
**Resolution**: We will ensure the directory is created if it does not exist, or ensure we check for undefined `snapshotBefore.id`. (Note: The log showed `Snapshot taken: undefined` which means `create()` returned something without an `id` or failed silently).
