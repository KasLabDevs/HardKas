# Frictions Found in Lab 14 (Real Node Validation)

## 1. `RpcBlock` vs `DagBlock` Incompatibility
- **Friction**: The RPC returns blocks in a heavily nested format (`rpcBlock.header.parentsByLevel[0].parentHashes`), while the DAG Toolkit (`DagBlock`) expects a flatter structure (`parents: string[]`). 
- **Workaround**: We had to build a custom `rpcBlockToDagBlock` adapter in the lab.
- **Impact**: Developers syncing real nodes to HardKAS will have to write boilerplate adapters. The SDK should eventually offer an out-of-the-box `kaspaRpcToHardkas` adapter.

## 2. BigInt Serialization in Snapshot Toolkit
- **Friction**: `RpcBlock` fields like `blueScore` and `timestamp` are parsed as `BigInt`, but `SnapshotToolkit` (specifically `FsSnapshotBackend`) uses standard `JSON.stringify`, which throws `TypeError: Do not know how to serialize a BigInt`.
- **Workaround**: We casted `BigInt` to `Number` inside the block adapter to satisfy the snapshot serialization.
- **Impact**: We need to implement a custom JSON replacer/reviver in `SnapshotToolkit` that supports `BigInt`.

## 3. Missing `getBlocks` Wrapper
- **Friction**: Our `KaspaRpcClient` wrapper does not expose `getBlocks`.
- **Workaround**: We had to cast the RPC client to `any` and use the internal `callMethod("getBlocks", "getBlocksRequest", ...)` to fetch blocks.
- **Impact**: The RPC wrapper is incomplete and missing core commands needed to sync a local indexer with a real node.

## 4. `getUtxosByAddress` / `getUtxosByAddresses`
- **Friction**: We had to use `getUtxosByAddress` (singular) since plural was missing or threw deserialization errors on the simulated node.
- **Workaround**: Catching the deserialization error and handling it locally.
- **Impact**: SDK should correctly type and handle plural addresses for UTXO lookups.
