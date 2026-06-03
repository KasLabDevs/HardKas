# SDK Guide

The `@hardkas/sdk` package is the programmatic interface to the HardKAS ecosystem.

## Core Services

When you instantiate the SDK (`Hardkas.create()`), you gain access to several isolated services:

### 1. `sdk.tx`
Handles the core transaction lifecycle.
- **`plan({ from, to, amount, feeRate })`**: Returns a `TxPlanArtifact`. Normalizes the inputs and creates a deterministic cryptographic hash.
- **`sign(planArtifact, signerId)`**: Takes a `TxPlanArtifact` and returns a `SignedTxArtifact`. Expects valid signer authorization.
- **`simulate(signedArtifact)`**: Sends the transaction to the local simulated network to produce a `TxReceiptArtifact`. Ensures 100% semantic isolation.
- **`send(signedArtifact)`**: Similar to simulate, but targets the active network provider (e.g., testnet).

### 2. `sdk.artifacts`
Handles the storage, retrieval, and validation of the cryptographic objects.
- **`read(artifactId)`**: Loads an artifact from the local `.hardkas/artifacts/` store and automatically performs Zero-Trust validation.
- **`write(artifact)`**: Commits a valid artifact to the filesystem using an atomic rename operation to prevent corruption.
- **`verify(artifact)`**: Dynamically recalculates the canonical hash and ensures data integrity. Throws if corrupted.

### 3. `sdk.query`
Provides indexed access to the artifact lineage via SQLite.
- **`sync()`**: Scans the `.hardkas/events.jsonl` ledger and builds a relational projection.
- **`lineage(artifactId)`**: Returns the parent-child graph (e.g., `Plan -> SignedTx -> Receipt`).

### 4. `sdk.accounts`
Manages the local simulation keystore.
- **`list()`**: Returns available mock accounts (e.g., `alice`, `bob`).
- **`balance(accountId)`**: Retrieves the current balance from the simulated UTXO set.

## Error Handling

HardKAS methods throw specific `HardkasError` subclasses. Always check `error.code`:
- `HASH_MISMATCH`: The artifact has been tampered with.
- `MISSING_CONTENT_HASH`: The object is missing required cryptographic identity.
- `INVALID_SIGNER`: The requested signer does not match the planned sender.
