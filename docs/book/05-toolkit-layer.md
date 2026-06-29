# Chapter 05: Toolkit Layer

The `@hardkas/toolkit` package is the culmination of building real applications. It hides complex infrastructure (`WalletManager`, `DomainStoreJson`, `ArtifactIndexStore`) behind simple facades.

## Available Toolkits
- **`WalletToolkit`**: Send and receive Kaspa.
- **`PaymentToolkit`**: Invoices and Receipts.
- **`IndexerToolkit`**: Chain indexing and artifact search.
- **`JobsToolkit`**: Background task runner.

Toolkits are strictly facades. They orchestrate complex behavior but expose simple, domain-driven APIs.
