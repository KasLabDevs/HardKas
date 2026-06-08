# Transaction Lifecycle

The HardKAS lifecycle is a one-way deterministic state machine.

```mermaid
graph TD
    A[Node UTXOs] -->|tx plan| B(txPlan Artifact)
    B -->|tx sign| C(signedTx Artifact)
    C -->|tx send| D[Node RPC]
    D -->|receipt| E(Receipt Artifact)
```

## Validation at Every Step
- **Plan to Sign**: The signer hashes the `txPlan` and refuses to sign if the schema is invalid.
- **Sign to Send**: The sender checks the cryptographic hash of the `signedTx` against its own `lineage.artifactId`. If they do not match, the payload was tampered with and is aborted.
