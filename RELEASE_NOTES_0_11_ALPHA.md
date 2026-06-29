# HardKAS 0.11-alpha Release Notes

## Overview
HardKAS 0.11-alpha finalizes the runtime validation of the framework. We have transitioned from a strictly local-first simulation environment to an architecture capable of running against real Kaspa nodes while preserving the original deterministic, artifact-driven API model.

## Key Consolidations
- **Runtime Validated**: Toolkits (`WalletToolkit`, `IndexerToolkit`, `DAGToolkit`, `SnapshotToolkit`, `JobsToolkit`, `UTXOToolkit`) now function against both `Simulator` instances and real `kaspad` RPC instances via the plugin system.
- **Silver Phase 1A**: A fully integrated, purely functional memory-based compiler shim for the Kaspa Silver ecosystem, emitting strict simulation-only deterministic artifacts.
- **Plugin Infrastructure**: `BackendPlugin` architecture finalized, allowing backend swap without changing application-level API consumption.

## Known Limitations
As an alpha runtime, several explicit boundaries remain:
- **Silver Toolkit is simulated only**: Real compilation to Kaspa WebAssembly is mocked for predictability.
- **No L2 production tooling**: All Layer 2 functionality remains experimental and unproven.
- **No mainnet broadcast guarantees**: This remains a developer-centric framework. Usage on mainnet with real value is unsupported.
- **RPC backend plugin is V1**: Real-node RPC (`plugin-rpc-backend`) currently relies on external standard RPC nodes; comprehensive indexing may be limited or require local caching proxies in future updates.
- **Snapshot external backends are metadata/stub based**: Snapshots are fully supported against local simulation state, but snapshots triggered against external Kaspa nodes simply export a capability stub rather than a multi-gigabyte chain state.
