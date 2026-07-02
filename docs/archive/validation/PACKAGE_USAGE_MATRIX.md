# Package Usage Matrix

This matrix demonstrates how the Showcase Suite exercises the modular packages of the HardKAS framework.

| Package | Used By Apps | Primary Responsibility |
|---|---|---|
| **@hardkas/core** | All | Domain types, Events, Telemetry, Context |
| **@hardkas/toolkit** | All (except CLI Studio) | Facade pattern for rapid integration |
| **@hardkas/storage-sqlite** | Mission, Wallet, Treasury, Merchant | Persistent state, WAL DB initialization |
| **@hardkas/query-store** | Explorer, Mission, Wallet | View layer projection models |
| **@hardkas/jobs** | Treasury, Wallet | Resumable tasks, Tx submission polling |
| **@hardkas/artifacts** | Merchant, Wallet, Explorer | Verification proofs and Receipts |
| **@hardkas/kaspa-rpc** | Mission, Explorer, Merchant | Connecting to simulated/testnet node |
| **@hardkas/accounts** | Wallet Pro, Treasury | Key derivation, Bip32, Keystore mgmt |
| **@hardkas/tx-builder**| Wallet Pro | Coin selection, fee estimation |
| **@hardkas/sync-daemon**| Mission Control | DAG block synchronization |
| **@hardkas/localnet** | Time Travel, Mission | Node spin-up and lifecycle |
| **@hardkas/cli** | CLI Studio | SDK programmatic CLI execution |
