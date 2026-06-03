# Artifact Lifecycle

In HardKAS, state transitions are represented as immutable JSON files called **Artifacts**. Each artifact guarantees strict determinism and is cryptographically hashed.

## The Lifecycle

The artifact pipeline represents a strict DAG (Directed Acyclic Graph) of operations.

1. **Plan (`TxPlanArtifact`)**: 
   The initial intent. You specify the sender, receiver, and amount. HardKAS normalizes this into a deterministically ordered JSON structure.
2. **SignedTx (`SignedTxArtifact`)**:
   The plan is mathematically signed by the required parties (e.g., Alice). The signature is appended to the artifact, creating a new deterministic hash that points back to the parent `Plan`.
3. **Receipt (`TxReceiptArtifact`)**:
   Once the `SignedTx` is sent and simulated/accepted by the network, a `Receipt` is generated. This locks the state transition.
4. **Replay (`ReplayArtifact`)**:
   Optionally, receipts and signed transactions can be run through the Replay Engine to mathematically prove deterministic execution offline.

## Core Concepts

### 1. The `contentHash`
Every artifact contains a `contentHash` (usually SHA-256). This hash is the exact representation of the canonical serialization of the artifact's payload.

### 2. Canonical Serialization
To guarantee that `hash(A)` equals `hash(B)` across different operating systems, HardKAS enforces strict JSON key sorting and Unicode normalization before generating the hash.

### 3. Lineage
Artifacts point to their parents. A `SignedTx` contains the `artifactId` of its `Plan`. A `Receipt` contains the `artifactId` of its `SignedTx`. This creates an unbroken, auditable cryptographic chain.

### 4. Zero-Trust Verification
When an artifact is loaded, the SDK ignores the `contentHash` in the file. It mathematically recalculates the hash from the payload. If the calculated hash does not match the stated hash, the artifact is rejected. This prevents manual tampering of amounts or signatures.
