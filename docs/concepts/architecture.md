# Architecture

HardKAS is designed to isolate risk.

## Package Separation
- **@hardkas/sdk**: The core logic. Contains the Planner, Signer, and Provider interfaces.
- **@hardkas/cli**: The orchestration layer. Never imports private key logic directly into global scope; relies on strict boundaries.
- **@hardkas/client**: The DOM layer. Isolates React state from WASM lifecycle events.
- **@hardkas/accounts**: The keystore implementation.

## Why this Architecture?
Standard wallets often bundle UTXO fetching, memory storage, and signing into one massive runtime blob. If a V8 memory leak occurs, or if a dependency is compromised, the keys and the network state are simultaneously vulnerable. 

HardKAS separates state generation (Planning) from cryptographic authorization (Signing) using file-system artifacts as the unbreakable boundary.
