# HardKAS Runtime Semantics

HardKAS is a deterministic artifact-centric runtime. Its core philosophy is that **canonical truth must be isolated from environmental noise**.

When executing workloads across fundamentally different platforms (e.g., Windows vs Linux), the underlying operating systems will behave differently regarding filesystem locking, timestamp scheduling, symlink resolution, and latency.

To guarantee that the runtime works perfectly, HardKAS enforces strict **cross-platform truth equivalence**.

## Truth vs Noise

HardKAS explicitly categorizes runtime behavior into two buckets:

### 1. Environmental Noise (Excluded from Semantics)

- `mtimes` (Filesystem modification timestamps)
- `executionDurationMs` (Time taken to complete a workflow)
- `osLockTiming` (The order and frequency of file locks)
- `sandboxSnapshotPath` (Absolute paths or temp directory names)
- `telemetryEventOrdering` (The order of STALE_LOCK_RECOVERY or FS_RETRY events)
- **OS-specific transient errors** (e.g., Windows `EBUSY` vs Linux `ENOENT` during races).

### 2. Canonical Truth (Included in Semantics)

- The exact deterministic **Semantic Hashes** of the output artifacts.
- The **Lineage Graph** (which artifact produced which).
- The final **Status Lattice** result (`VERIFIED`, `STALE`, etc.).
- The number of **Satisfied Invariants**.
- The specific `artifactId`s that have been committed.

## Filesystem Boundaries & Security

### Workspace Path Traversal Prevention
HardKAS strictly restricts artifact reads and writes to the workspace boundary.
- `sdk.artifacts.read()` and related methods must resolve absolute paths and verify they are prefixed with the workspace root.
- Any attempt to access files outside the workspace (e.g., `../../../.ssh/id_rsa`) will throw a `HardkasError('PATH_TRAVERSAL')`.

### Canonical Directory Resolution
Canonical directories (`artifacts`, `receipts`, `traces`, `deployments`) are resolved **directly from the workspace root** (`.hardkas/`).
- They are not nested recursively (e.g., `.hardkas/artifacts/.hardkas/receipts` is invalid). Replay and query tools strictly adhere to this flat `.hardkas/` structure.

## Semantic Bundle v1

To prove cross-platform truth equivalence, the HardKAS CI pipeline exports a `hardkas.semantic-bundle.v1.json` artifact. This represents the portable mathematical proof of the system's state.

```json
{
  "schemaVersion": "hardkas.semantic-bundle.v1",
  "runtimeVersion": "0.8.15-alpha",
  "hashVersion": "sha256",
  "globalSemanticHash": "...",
  "invariantSummary": { "totalChecks": 9000, "passedChecks": 9000, "failedChecks": 0 },
  "artifacts": [ ... ],
  "excludedNoiseFields": [ "sandboxSnapshotPath", "executionDurationMs", "fsMtimes" ]
}
```
