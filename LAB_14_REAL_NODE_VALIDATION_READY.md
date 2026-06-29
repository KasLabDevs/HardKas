# Lab 14 Real Node Validation Ready

The Real Node Validation (P48/Lab 14) has been successfully implemented and verified.

## What Was Achieved
- **Docker Simnet Orchestration**: Integrated `DockerKaspadRunner` to seamlessly orchestrate a local Docker Kaspa node for validation.
- **RPC Connectivity**: Established wRPC connectivity to the real node and verified health checks.
- **Block Adaptation**: Created an adapter to translate real `RpcBlock` structures into the format expected by the `DagApi`.
- **DAG Toolkit Validation**: Successfully ingested real blocks into `IndexerToolkit` and validated statistical accuracy (`totalBlocks` and `blueScore`).
- **Snapshot Validation**: Verified that `SnapshotToolkit` can successfully capture and restore a DAG containing real adapted block data.

## Frictions Discovered
The integration revealed several gaps between the SDK and real node data, which have been documented in `labs/14-real-node-validation/FRICTIONS.md`:
1. `RpcBlock` requires manual flattening to fit `DagBlock`.
2. `SnapshotToolkit` lacks native `BigInt` serialization.
3. `KaspaRpcClient` is missing a public `getBlocks` method.
4. `getUtxosByAddresses` threw deserialization errors requiring a fallback to singular forms.

## Conclusion
HardKAS is capable of ingesting and simulating state from a real Kaspa node. The documented frictions provide a clear path for refining the SDK in the next iteration.

**Status**: READY.
