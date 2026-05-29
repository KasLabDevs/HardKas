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

## Semantic Bundle v1

To prove cross-platform truth equivalence, the HardKAS CI pipeline exports a `hardkas.semantic-bundle.v1.json` artifact at the end of execution.

This bundle represents the **portable mathematical proof** of the system's state. If `hardkas.semantic-bundle.v1.json` matches exactly byte-for-byte across Windows and Linux, the runtime's determinism is validated.

### Schema: `hardkas.semantic-bundle.v1`

```json
{
  "schemaVersion": "hardkas.semantic-bundle.v1",
  "runtimeVersion": "0.7.5-alpha",
  "hashVersion": "sha256",
  "globalSemanticHash": "...",
  "invariantSummary": {
    "totalChecks": 9000,
    "passedChecks": 9000,
    "failedChecks": 0
  },
  "statusSummary": { ... },
  "artifacts": [
    {
      "artifactId": "plan-1234...",
      "semanticHash": "abcdef...",
      "lineageEdges": ["receipt-5678..."]
    }
  ],
  "excludedNoiseFields": [
    "sandboxSnapshotPath",
    "executionDurationMs",
    "telemetryEventOrdering",
    "osLockTiming",
    "fsMtimes"
  ]
}
```

The `globalSemanticHash` is computed over the stable JSON representation of the bundle itself (excluding the `globalSemanticHash` field).
