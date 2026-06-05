# Limitations

HardKAS is currently in **Alpha**. To build trust, we believe in being brutally honest about what the software currently cannot do. If your project requires these features, you must handle them externally.

## 1. Local-First Only (For Now)
HardKAS is heavily optimized for a `network: 'simulated'` environment. While there is early support for Kaspa testnet adapters, mainnet broadcast logic, mempool tracking, and heavy RPC node integration are considered experimental and unhardened. Do not use HardKAS to route high-value mainnet transactions.

## 2. No Built-in State Machine VM
HardKAS ensures the cryptographic integrity of *Artifacts* (the JSON payload), but it does not run an internal Turing-complete VM. If you plan a transaction to Igra L2, HardKAS proves the transaction is byte-deterministic, but it relies on an external Igra node simulator to actually execute the L2 logic.

## 3. High-Concurrency Write Locks
The current SQLite `query-store` indexer and the filesystem watcher use basic lock-retry mechanisms (`.lock` files). Under extremely high concurrency (e.g., thousands of simultaneous writes), the SQLite indexer may lag behind the file system. The canonical truth (files) remains perfectly safe, but `query` endpoints may return stale data for a few milliseconds.

## 4. Keystore is Insecure
The local simulated accounts (`alice`, `bob`) use hardcoded or plaintext keystores. This is by design for local testing reproducibility. **Do not** import mainnet seed phrases into HardKAS.

## 5. Legacy Direct Read Compatibility
While HardKAS indexers (`query store rebuild`) safely handle older artifacts (0.7.x - 0.8.11-alpha), direct artifact API reads (`sdk.artifacts.verify`) may fail with `Artifact not found` instead of gracefully parsing older schema files due to changes in filename mapping rules (`plan-*` vs legacy names). This acts as a safe rejection barrier (`SAFE_REJECT_UNSUPPORTED`). A future `migrate artifact` command will be provided to automatically rename and upgrade these schemas.
