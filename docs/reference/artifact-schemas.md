# Reference: Artifact Schemas

HardKAS v0.2-alpha uses the following schema identifiers to distinguish artifact types and versions.

## L1 (Kaspa) Artifacts

| Schema ID | Version | Description |
| :--- | :--- | :--- |
| `hardkas.txPlan.v2` | 2.0.0 | A transaction blueprint (unsigned). |
| `hardkas.signedTx.v2` | 2.0.0 | A transaction with signatures. |
| `hardkas.txReceipt.v2` | 2.0.0 | Proof of broadcast/acceptance. |
| `hardkas.txTrace.v2` | 2.0.0 | BlockDAG operational history. |
| `hardkas.snapshot.v2` | 2.0.0 | Localnet state snapshot. |

## L2 (Igra) Artifacts

| Schema ID | Version | Description |
| :--- | :--- | :--- |
| `hardkas.igraTxPlan.v1` | 1.0.0 | Igra EVM transaction blueprint. |
| `hardkas.igraSignedTx.v1` | 1.0.0 | Signed Igra transaction. |
| `hardkas.igraTxReceipt.v1` | 1.0.0 | Igra transaction receipt. |

## Infrastructure Artifacts

| Schema ID | Version | Description |
| :--- | :--- | :--- |
| `hardkas.localnetState.v1` | 1.0.0 | Current simulator state (Internal). |
| `hardkas.realAccountStore.v1` | 1.0.0 | Secure keystore metadata. |

## Common Header Fields

All v2 artifacts contain:

| Field | Type | Description |
| :--- | :--- | :--- |
| `schema` | `string` | The unique schema identifier (e.g., `hardkas.txPlan.v2`). |
| `version` | `string` | The semantic version of the artifact format (e.g., `2.0.0`). |
| `hardkasVersion` | `string` | The version of HardKAS that generated the artifact. |
| `networkId` | `string` | The target network (e.g., `simnet`, `testnet-10`, `mainnet`). |
| `mode` | `enum` | Operation mode: `simulated` (dev/test) or `real` (mainnet/testnet). |
| `contentHash` | `string` | SHA-256 seal of the artifact's semantic data. |
| `lineage` | `object` | Provenance metadata for chain-of-custody verification. |

### The Lineage Block

The `lineage` object enables formal provenance tracking:

```typescript
{
  artifactId: string;       // Content-addressable ID (usually matching contentHash)
  lineageId: string;        // Stable UUID for the entire operational flow
  rootArtifactId: string;   // ID of the first artifact in the chain (e.g., Snapshot)
  parentArtifactId?: string;// ID of the immediate predecessor (Optional for Root)
  sequence?: number;        // Monotonic counter within the flow
}
```

## The Query Store (Read Model)

While `.json` artifacts and `.jsonl` event logs are the **canonical source of truth**, HardKAS uses a high-performance **SQLite store** (`.hardkas/store.db`) as a rebuildable read model.

### Key Architectural Rules:
1. **Source of Truth**: The filesystem (`.hardkas/`) is the ONLY canonical source of truth.
2. **Rebuildability**: The SQLite store can be wiped and recreated at any time via `hardkas query store rebuild`.
3. **Determinism**: Rebuilding the store from the same artifacts and events MUST produce a semantically identical query state.
4. **Non-Persistence**: The store should NOT be committed to version control; it is a local operational cache.
5. **Freshness**: The CLI automatically synchronizes the store when `mtime` changes are detected on the source files.
