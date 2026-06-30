# HardKAS 0.11.1-alpha: The First Local-First Application Runtime for Kaspa

> [!NOTE]
> **Version Notice**: `0.11.0-alpha` was a partial release due to a registry collision and has been superseded. `0.11.1-alpha` is the valid, recommended release for this milestone.

HardKAS is **not** a Hardhat clone. While Hardhat focuses on smart-contract development for EVM chains, HardKAS focuses on the complete Kaspa application lifecycle. 

HardKAS is the first validated local-first application runtime for Kaspa.

## Highlights
- ✅ **Real Docker Validation**: Validated against a real Docker kaspad node, not only synthetic simulations.
- ✅ **Local-first runtime**: The Wallet, UTXO, Payments, DAG, Indexer, Jobs, and Snapshots toolkits all work seamlessly together in an instant memory environment.
- ✅ **Backend Plugin Architecture**: Allows the exact same application code to switch between a local simulation and a real RPC backend without changing its public API.
- ✅ **Native BigInt Precision**: All monetary values and consensus-related quantities use precise native `bigint`, eliminating floating-point errors.
- ✅ **Deterministic Testing & Evidence-First Execution**: Ensures reproducible application behavior and cryptographically records execution paths.

## Runtime Architecture
HardKAS groups complexity into specialized `Toolkits` that can be orchestrated together. You don't have to understand everything about Kaspa to get started, but you have the power to control everything when you need to.

### Available Toolkits
- **WalletToolkit**: Manages keys, coin selection, and transaction building.
- **UTXOToolkit**: Optimizes and analyzes UTXO sets at massive scale.
- **IndexerToolkit**: Fast historical and balance lookups.
- **DAGToolkit**: Topological analysis and block ingestion.
- **JobsToolkit**: Background queue processing with checkpoints and retries.
- **SnapshotToolkit**: Deterministic state capture for time-travel debugging.

## Plugin System
HardKAS plugins inject capabilities into Toolkits. For example, `IndexerToolkit` normally reads from memory, but passing `@hardkas/plugin-rpc-backend` transparently points it at a real node.

## Developer Experience
The framework is designed for immediate productivity. A simple `hardkas init` scaffolds a full TypeScript workspace, and the `0.11-alpha` release ensures all templates are rigorous, precise (`bigint`), and fully tested.

## Known Limitations (0.11-alpha)
- **Silver Toolkit**: Currently simulation-only.
- **L2 Production Tooling**: HardKAS simulates L2 sequencing, but production L2 tools are not yet available.
- **Mainnet Broadcast Guarantees**: We guarantee local execution validity, but mainnet mempool behaviors may reject valid transactions under heavy load. Use `simnet` for robust development.
- **RPC Backend Plugin V1**: Lacks connection pooling and jitter.
- **External Snapshots**: Remote node snapshots capture metadata stubs, not remote DAG state.

## What's Coming in 0.12
- Production backends (SQLite/Postgres)
- RPC retry/connection pooling improvements
- Dedicated sync daemon
- Real backend bridging for Silver Toolkit
- Advanced L2 Labs
