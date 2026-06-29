# Lab 11.5: Docker RPC DAG Validation

This certifies that **Lab 11.5** has been successfully prepared, but execution is skipped because the testing environment does not have a running Docker Kaspa node (Toccata/Localnet) at `127.0.0.1:16510`.

## Deliverables
- `DagRpcBlockAdapter`: Created to bridge the gap between `KaspaJsonRpcClient` responses and the normalized `DagBlock` expected by `LocalDagStore`.
- `rpc-validation.test.ts`: Created to validate that `indexer.dag` can ingest real Kaspa node blocks using the adapter, and subsequently execute declarative queries (`block`, `parents`, `statistics`, etc.).

**Status**: BLOCKED BY DOCKER ENV (Adapter & tests prepared and successfully skipping).
