# P49_REAL_NODE_FRICTION_FIXES_READY

## Goal
Fix friction points discovered during Lab 14 with a real Kaspa node.

## Accomplishments
1. **KaspaRpcClient Wrappers**
   - Added `getBlocks` to `KaspaRpcClient` interface and implementations (`JsonWrpcKaspaClient`, `LoadBalancedRpcProvider`, etc.).
   - Added `getUtxosByAddress` and `getUtxosByAddresses`.

2. **Official Adapters**
   - Extracted data shaping logic into official SDK adapters in `@hardkas/kaspa-rpc/adapters`.
   - `rpcBlockToDagBlock`: Normalizes `RpcBlock` structure to `DagBlock`.
   - `rpcUtxoToWalletUtxo`: Normalizes `RpcUtxo` to the standard format.
   - Built and exported natively via package exports (`import { ... } from '@hardkas/kaspa-rpc/adapters'`).

3. **BigInt-Safe Snapshots**
   - HardKAS snapshots use `JSON.stringify`, which crashed on `BigInt` properties.
   - Introduced `snapshotReplacer` and `snapshotReviver` to explicitly encode `BigInt` to a safe string format (`{$bigint: "..."}`) and deserialize it seamlessly.
   - Fixed `FsSnapshotBackend` and `MemorySnapshotBackend` to automatically handle `BigInt` objects securely.

4. **Lab 14 Cleaned Up**
   - Refactored `labs/14-real-node-validation/src/index.ts` to remove local custom adapters and direct `any` casting of `RpcClient`.
   - Lab 14 is now completely clean and demonstrates intended real-world RPC consumption.

## Result
Real Node friction points successfully integrated into the SDK core.
