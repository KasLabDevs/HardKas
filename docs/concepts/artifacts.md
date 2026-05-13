# Deterministic Artifacts

HardKAS is built on the principle of **Deterministic Artifacts**. In traditional blockchain development, transaction construction and broadcast are often tightly coupled and opaque. HardKAS decouples these phases into discrete, inspectable, and immutable files.

## The Artifact Workflow

The HardKAS lifecycle follows a strict progression:

1. **Plan (`.plan.json`)**: A blueprint of the transaction. Includes selected UTXOs, output amounts, fee estimations, and mass calculations.
2. **Sign (`.signed.json`)**: The plan plus cryptographic signatures (or simulated markers).
3. **Receipt (`.receipt.json`)**: The result of broadcasting the transaction to the network.
4. **Trace (`.trace.json`)**: The operational history and inclusion state of the transaction in the BlockDAG.

## Core Properties

### Immutability
Once created, an artifact's operational data is locked. HardKAS uses SHA-256 **Content Hashes** to ensure that any mutation to a plan or signature is immediately detectable.

### Portability
Artifacts are standard JSON files. You can:
- Generate a plan on a CI server.
- Review it on a local machine.
- Sign it on an air-gapped device.
- Broadcast it via a remote RPC node.

### Determinism
The `artifact verify` command ensures that the artifact complies with its schema and that its content hash matches its data. This enables the **Replay Invariant**: replaying the same artifact against the same state must produce the same result.

## Artifact Anatomy

Every v2 artifact shares a common header:

```json
{
  "schema": "hardkas.txPlan.v2",
  "hardkasVersion": "0.2.2-alpha",
  "version": "2.0.0",
  "networkId": "simnet",
  "mode": "simulated",
  "createdAt": "2026-05-09T01:52:16Z"
}
```

- **schema**: Defines the artifact type and version.
- **networkId**: The target Kaspa network (simnet, testnet-10, mainnet).
- **mode**: Whether the artifact was produced in a `simulated` environment or for a `real` network.

## Why Artifacts?

1. **Auditability**: You can verify what happened days after a transaction was sent.
2. **Safety**: Inspect fees and mass *before* committing a signature.
3. **CI/CD**: Build automated pipelines that verify transaction outcomes.
4. **Debugging**: Replay failed transactions locally using the exact same inputs.
