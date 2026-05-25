# HardKAS Semantic Vocabulary Canon

This document is the single, authoritative semantic source of truth for the HardKAS repository. All code comments, CLI outputs, dashboard views, and future documentation must adhere strictly to these definitions.

---

## Core System Terms

### Artifact
* **Definition**: An immutable, structured JSON document serialized under a defined Zod schema in the `.hardkas/` workspace directory, representing a transaction plan, execution receipt, workflow metadata, or system snapshot.
* **Property**: Contains a cryptographic `contentHash` and structural lineage identifiers.

### Projection
* **Definition**: A transient, read-only cache database (SQLite `store.db`) built by parsing and indexing local JSON artifacts.
* **Property**: Can be physically deleted at any time; will reconstruct from the filesystem with zero data loss.

### Replay
* **Definition**: The action of executing a transaction plan inside an isolated sandbox to verify its mathematical, structural, and economic consistency against an original receipt.

### Snapshot
* **Definition**: An immutable state artifact capturing virtual account balances and UTXO allocations at a specific block score in a localnet simulation.

### Stale
* **Definition**: A diagnostic condition indicating that the SQLite projection database has not yet finished parsing recent modifications on the filesystem.

---

## Verification & Integrity States

### Verified
* **Definition**: A transaction or workflow state where the replay engine successfully validates all economic, structural, and cryptographic invariants against the current local state.

### Degraded
* **Definition**: A state where the SQLite projection cache is corrupted or desynchronized, forcing the CLI/SDK to fall back to slow, direct JSON reads from the filesystem.

### Corrupted
* **Definition**: A fatal error state where a JSON artifact's calculated SHA-256 content hash does not match the signed `contentHash` field inside its metadata, indicating filesystem tampering.

---

## Runtime Properties

### Deterministic
* **Definition**: The operational guarantee that identical input parameters, wallet states, and policies always yield bit-for-bit identical transaction plans, sorting orders, and hashes across all systems.

### Simulated
* **Definition**: Running completely offline, bypassing real-world subnets and RPC endpoints, using virtual, local-first in-memory BlockDAG providers.

### Localnet
* **Definition**: A virtual, local-first mock network modeling BlockDAG structures locally.

### Provenance
* **Definition**: The causal lineage trail linking parent artifacts, executed workflow steps, and active sandbox policies to their final execution outcomes.

### Replay Exclusion
* **Definition**: The static list of volatile metadata fields (e.g. `rpcHost`, `latencyMs`, `createdAt`) skipped during canonical serialization to ensure hash determinism.

### Runtime Noise
* **Definition**: Ephemeral telemetry and diagnostic information (e.g. log files, process IDs) ignored during plan hashing.

### Canonicalization
* **Definition**: The multi-tiered process of sorting inputs, UTXOs, and outputs ASC to ensure plan determinism and identical cryptographic hashing.
