# Chapter 05: Toolkit Layer

The `@hardkas/toolkit` package is the culmination of building real applications. It hides complex infrastructure (`WalletManagerImpl` from `@hardkas/accounts`, `DomainStoreJson` from `@hardkas/query-store`, `ArtifactIndexStoreJson` from `@hardkas/artifacts`) behind simple facades.

## Available Toolkits
- **`WalletToolkit`**: Simnet development wallet facade over a synthetic identity (keys derivable from the wallet name; public networks are refused). Receive address, balance and UTXO planning for local testing — not custody, not for real funds.
- **`PaymentToolkit`**: Invoices and Receipts.
- **`IndexerToolkit`**: Chain indexing and artifact search.
- **`JobsToolkit`**: Background task runner. The job queue (`JobRunner`, `JobStoreJson`) is part of the toolkit; it was the separate `@hardkas/jobs` package before.
- **`SnapshotToolkit`**: Snapshots and restores of the local state of the toolkits registered with it.
- **`QueryToolkit`**: Balance and UTXO queries, from the indexer when there is one, else from the node.

Toolkits are strictly facades. They orchestrate complex behavior but expose simple, domain-driven APIs.
