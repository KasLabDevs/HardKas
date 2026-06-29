# SNAPSHOT_TOOLKIT_READY

The `SnapshotToolkit` has been fully implemented in `@hardkas/toolkit` as a transversal capability across the HardKAS runtime.

## Core Capabilities
- **SnapshotManager (`SnapshotToolkit`)**: Orchestrates snapshots across multiple participant toolkits.
- **Backends**: Includes `MemorySnapshotBackend` for ephemeral tests and `FsSnapshotBackend` for persistent time-travel debugging.
- **Evidence-First**: File system snapshots generate `snapshot.v1` manifests as lightweight pointers without dumping full state, aligning with the `Evidence` pattern.
- **Participants**: `JobsToolkit` and `IndexerToolkit` (`ProjectionStore`, `ArtifactIndexStore`, `DagStore`) implement `SnapshotParticipant`, providing their internal state correctly.
- **Actions**: Supports `create`, `restore`, `branch`, `compare`, and `diff`.

## Execution
- Registration is strictly explicit to avoid intrusive Toolkit API bloat.
- Restores apply state and reload caching instantly without process teardowns or restarts.
