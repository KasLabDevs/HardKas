# P52 Full Docker Runtime Gauntlet Passed

## Summary
The HardKAS 0.11-alpha runtime has been successfully validated against a real `kaspad` Docker instance in `simnet` mode.
This gauntlet proves that the runtime can coordinate Toolkits (Indexer, Wallet, Payment, Jobs, Snapshots) and the Docker RPC Backend Plugin without breaking the public API.

## Real Node Frictions Discovered
During the execution of this gauntlet against `kaspanet/rusty-kaspad:v1.1.0` (simnet), the following real-world frictions were encountered and documented:

1. **wRPC vs JSON-RPC**: `KaspaJsonRpcClient` (HTTP POST) gets immediately rejected by Rusty Kaspad's `--rpclisten-json` port (18210) because that port expects WebSocket wRPC connections, not HTTP POST.
   - *Fix*: Modified `kaspaRpcBackendPlugin` to dynamically detect `ws://` URLs and instantiate `KaspaWrpcClient` instead of `KaspaJsonRpcClient`.
2. **wRPC Envelope Deserialization Error**: `KaspaWrpcClient.request("getBalanceByAddress", ...)` fails with `request deserialization error` because standard nodes do not support the UTXO index requests natively without `--utxoindex` and the specific wRPC `GetBalanceByAddressRequest` envelope shape.
   - *Fix*: Caught the error in the gauntlet application and gracefully fell back to `balance: 0n`, setting `realFunding: false` and `utxoFixtureInjectedIfNeeded: true` as instructed.
3. **Background Jobs & Connections during Teardown**: Unhandled promise rejections (`SocketError: other side closed`) occurred when the Docker node was stopped while background jobs or subscriptions were still polling the RPC interface.
   - *Fix*: Added `disconnect()` capabilities to `IndexerBackendPlugin` and gracefully disconnected the RPC clients before stopping the Docker runner in the test shutdown phase.

## Gauntlet Components Validated
- [x] `DockerKaspadRunner` (Spin up and Teardown)
- [x] `KaspaWrpcClient` (DAG Stats and Health Check)
- [x] `IndexerToolkit` (Routed to real RPC backend)
- [x] `WalletToolkit`
- [x] `PaymentToolkit` (Invoices & Receipts)
- [x] `JobsToolkit` (Background async tasks)
- [x] `SnapshotToolkit` (Local metadata snapshots)
- [x] `Evidence Claims` (Generated `docker-runtime-gauntlet.evidence.json`)

**Status**: P52_FULL_DOCKER_RUNTIME_GAUNTLET_COMPLETED
