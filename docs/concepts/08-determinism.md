# Determinism & Replayability

Determinism is the foundation of HardKAS. If a transaction succeeds locally, it must succeed globally, byte-for-byte.

## 1. Hash Determinism & Canonical Ordering
To guarantee that identical transaction parameters yield identical `contentHash` results across any operating system (Windows, Linux, macOS), HardKAS strictly enforces **Canonical JSON Serialization**.
Before any object is hashed, its keys are sorted alphabetically. Numbers are parsed explicitly to prevent JS engine rounding differences. This ensures that creating the exact same plan 100 times yields the exact same cryptographic hash.

## 2. Cross-Platform Expectations
We intentionally exclude "Environmental Noise" from cryptographic validation:
- Filesystem modification timestamps (`mtimes`)
- Execution duration milliseconds
- Temporary sandbox paths

These fields vary across OS runs and are explicitly stripped before mathematical verification.

## 3. Replay Determinism
The HardKAS Replay Engine can take a past transaction and re-execute its semantics in the local simulation. The result must be byte-identical to the original receipt.
If you simulate a transaction today, and simulate the identical transaction tomorrow with the same local snapshot, HardKAS guarantees 100% replay determinism.
