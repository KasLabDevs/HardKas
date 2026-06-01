# The Runtime Environment

HardKAS is not just a library; it is a formal Runtime Environment with strict semantic contracts.

To fully understand how HardKAS enforces determinism, cross-platform identicality, and causal lineage, please read the root contract files:

1. **[RUNTIME_CONTRACT.md](../RUNTIME_CONTRACT.md)**
   Defines the authority hierarchy, crash consistency semantics, and strict JSON contracts.
2. **[RUNTIME_SEMANTICS.md](../RUNTIME_SEMANTICS.md)**
   Explains the separation between environmental noise and canonical truth, and details the Semantic Bundle proof system.

## Key Principles

- **No Environmental Noise:** HardKAS ignores OS-specific filesystem locking quirks, millisecond timestamps, and execution speeds.
- **Byte-Identical Outputs:** If you run a workflow on Linux and Windows, the resulting Semantic Bundle is guaranteed to hash identically.
- **Workspace Isolation:** HardKAS prevents path traversal. Artifact managers cannot read or write outside the workspace boundary.
