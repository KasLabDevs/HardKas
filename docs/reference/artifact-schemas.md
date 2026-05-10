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
- `schema`: The ID from the table above.
- `hardkasVersion`: The SDK version that produced it.
- `version`: The schema version (e.g., `2.0.0`).
- `networkId`: Target network (e.g., `mainnet`, `simnet`).
- `mode`: `simulated` or `real`.
- `contentHash`: SHA-256 integrity seal.
- `lineage`: Provenance metadata.
