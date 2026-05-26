# HardKAS Runtime Semantics

This document formally defines the semantic constitution of HardKAS. It outlines canonical truth, artifact authority, replay semantics, lineage guarantees, projection semantics, the status lattice, capability semantics, migration semantics, and canonicality boundaries.

## 1. Single Source of Truth
The **Semantic Layer** (`packages/core/src/semantics`) is the single authoritative source of truth. No subsystem (Dashboard, Replay, Query-Store, Workflows, CLI, Agents) may independently implement verification logic, corruption detection, lineage verification, projection freshness, capability boundaries, or canonicality checks.

**Invariant:** `all_truth_resolution_flows_through_canonical_semantic_layer`

## 2. Ban Implicit Latest
Implicit resolution by "latest" is strictly forbidden across the deterministic runtime. All canonical references must be explicitly pinned by:
- `artifactId`
- `lineageId`
- `replayHash`
- `semanticHash`

Methods like `getLatestArtifact()`, `resolveLatestDeployment()`, or falling back to a default `currentDaaScore` for forks without explicit declaration are forbidden. 

**Invariant:** `canonical_resolution_never_depends_on_implicit_latest`

## 3. Formal Artifact Status Lattice
All artifacts exist within a strict, formally defined state lattice. The statuses are:
- `UNKNOWN`: Unreadable, ambiguous, partially classified, migration-pending states.
- `PROJECTED`: An artifact read from disk / state whose truth has not yet been verified.
- `STALE`: An artifact whose dependencies/lineage has drifted since it was verified.
- `VERIFIED`: Integrity, signature, and internal capability constraints are verified.
- `REPLAY_VERIFIED`: Full lineage and determinism verified via an active replay.
- `CORRUPTED`: Irreparable semantic or cryptographic corruption detected.
- `QUARANTINED`: Corrupted or malicious artifact safely isolated from runtime.

Transitions are strictly validated (e.g., `PROJECTED -> VERIFIED` is legal, but `CORRUPTED -> VERIFIED` is forbidden). 

**Invariant:** `artifact_status_transitions_are_semantically_valid`

## 4. Replay Semantics
Replay verification must be completely isolated from ambient runtime state. It must verify the semanticHash, lineage continuity, capability constraints, schema compatibility, canonical artifact resolution, and projection freshness.

**Invariant:** `replay_isolated_from_ambient_runtime_state`

## 5. Schema Evolution and Migration
Schema version 1 is established as the formal baseline. Every artifact must carry an explicit `schemaVersion`. Migrations between schema versions must preserve the semantic identity and lineage.

**Invariant:** `schema_evolution_preserves_semantic_identity`

## 6. Semantic Drift Detection
Subsystems must not disagree on the truth. The runtime continuously compares the Dashboard view, Query-Store view, Replay view, Filesystem truth, and Lineage graph. If they diverge (e.g., Dashboard says VERIFIED but Replay says STALE), it is a critical semantic failure and the system will fail loudly.

**Invariant:** `subsystems_cannot_disagree_about_canonical_truth`

## 7. Platform Semantics and Filesystem Authority
The runtime must deterministically survive chaos from the outside world, including Windows/Linux filesystem discrepancies, CI environment mutations, network drive latencies, and Docker mount anomalies. The runtime must either handle the environment safely or fail loudly.

**Invariant:** `windows_filesystem_semantics_cannot_corrupt_canonical_truth`
**Invariant:** `containerized_mounts_preserve_semantic_equivalence`
**Invariant:** `ci_environment_variation_preserves_runtime_truth`
**Invariant:** `network_filesystem_latency_cannot_create_semantic_divergence`
**Invariant:** `long_path_failure_never_creates_partial_canonical_state`

## 8. Cross-Platform Equivalence Guarantees
Same artifacts + same inputs must produce the identical semantic hash, lineage, and replay result across Windows, Linux, and simulated CI/Docker environments. To guarantee this, all hashing inputs (including paths and line endings) are explicitly normalized prior to hashing. Platform-specific fallbacks without normalization are forbidden.

**Invariant:** `cross_platform_semantic_equivalence_preserved`

## 9. Unicode Normalization Rules
Unicode normalization across operating systems can cause invisible drift (e.g., NFC vs NFD on macOS vs Windows). HardKAS strictly normalizes all string inputs to NFC prior to semantic hash computation to ensure identical semantic identity regardless of OS normalization.

**Invariant:** `unicode_normalization_never_changes_artifact_identity`

## 10. Symlink Resolution Rules
Symlinks, junction points, and recursive directories can be abused to break the canonical sandbox boundaries. Whether running in `REAL_SYMLINK_MODE` or `SIMULATED_SYMLINK_MODE`, resolution can never escape the workspace root.

**Invariant:** `symlink_resolution_cannot_escape_canonical_boundaries`

## 11. Environment Failure Semantics
When environment chaos—such as external human edits, antivirus file-locking, or clock skew—causes disagreement, the system strictly forbids silent canonical contamination. It must fail loudly, quarantine, and preserve the sandbox snapshot for forensic replay debugging.

**Invariant:** `manual_user_interference_cannot_silently_corrupt_truth`
**Invariant:** `external_file_interference_never_creates_false_canonicality`
**Invariant:** `clock_skew_cannot_break_replay_or_incremental_sync`
