# RFC-001: HardKAS Runtime Contract
**Status:** DRAFT
**Category:** Architecture & Semantics
**Target:** v1.0.0 (HardKAS Runtime)

## 1. Executive Summary

HardKAS is evolving from "developer tooling" to a formal **Runtime Environment**. This RFC defines the strict semantic contracts, authority hierarchies, and deterministic guarantees that govern the HardKAS execution model. These rules are absolute and must be enforced at the compiler, runtime, and filesystem levels.

## 2. Non-Goals (v1)

HardKAS is NOT:
- A distributed consensus system
- A multi-writer coordination engine
- A cloud orchestration platform
- A general-purpose smart contract VM
- An authoritative database

HardKAS intentionally prioritizes:
- Deterministic local-first execution
- Reproducible transaction workflows
- Append-only artifact lineage
- Explicit authority boundaries

## 3. Supported Filesystem Assumptions

HardKAS currently assumes local POSIX-like filesystem semantics (atomic renames, sane fsync guarantees, reliable directory operations). 
Network filesystems, distributed mounts, Docker bind mounts in weak-sync modes, and certain WSL edge cases are **not guaranteed safe in v1**. 

## 4. Authority Hierarchy & Artifact Identity

The filesystem is the sole source of truth. 
- **Artifacts:** Append-only, cryptographically verifiable JSON documents.
- **Identity Model:** Every artifact must possess a deterministic `contentHash` and a lineage graph (`parentId`, `causalDependencies`).
- **Projections (query-store):** Strictly disposable. They hold zero authority. 
- **Watchers:** Watchers are optimization hints, not correctness primitives. They are purely invalidation signals, never a source of truth.

## 3. Workspace Concurrency Contract v1

To prevent filesystem authority from remaining ambiguous, the workspace adheres to the following strict concurrency rules:
- **Single Logical Writer:** Only one writer may mutate a specific causal lineage within a workspace.
- **Append-Only:** Artifacts are strictly append-only. Modification of a committed artifact is a corruption event.
- **Atomic Commits:** Writes occur via `temp file` + `fsync` + `atomic rename`.
- **Visibility Barrier:** Artifacts are completely invisible to the runtime until the atomic commit rename succeeds. Partial writes are inherently invalid artifacts.
- **Eventual Consistency:** Projections (indexes, databases) are eventually consistent and lag behind filesystem authority.
- **Projection Lag:** Projection lag must *never* corrupt authority. A stale projection must fail gracefully or trigger a rebuild.
- **Source-of-Truth Recovery:** Rebuilding from artifacts is the only valid recovery path for corrupted projections.

## 4. Visibility Semantics

The question *"When does something exist?"* is the core of the runtime. Artifacts transition through strict visibility states:
1. **Staged:** Written to a temporary file, invisible to observers.
2. **Committed:** Atomically renamed to its final deterministic hash path.
3. **Visible:** Picked up by the filesystem watcher (invalidation signal).
4. **Indexed:** Successfully parsed and ingested by the `query-store` projection.
5. **Replayable:** Cryptographically verified by the Replay Engine against its parent lineage.
6. **Archived:** Safely compressed or moved out of the hot working set.

Different actors (watcher, projection, replay engine, workflows, dashboard) observe different states.

## 5. Failure Semantics & Crash Consistency Matrix

HardKAS guarantees safe recovery under abrupt termination.

| Failure Event | Guarantee / Recovery Path |
| :--- | :--- |
| **Crash before rename** | Artifact remains invisible (temp file garbage collected) |
| **Crash after rename** | Artifact committed, fully authoritative |
| **Projection corruption** | Fully rebuildable via `hardkas rebuild --from-artifacts` |
| **Watcher miss** | Recoverable by generation scan upon orchestrator restart |
| **Partial JSON read** | Deemed invalid artifact (ignored or quarantined) |
| **Dashboard stale** | Non-authoritative, UI eventually consistent via SSE |

## 6. Deterministic Bootstrap (`hardkas dev`)

Every `hardkas dev` instance must be a parallel universe that is strictly identical. To ensure replays, demos, CI, and debugging never diverge, the bootstrap process guarantees:
- Same fixture accounts.
- Same cryptographic seeds.
- Same network topology.
- Same workspace layout.
- Same initial projection state.

## 7. Workflow Determinism & Execution Identity

Workflow Execution IDs (`workflowId`) are strictly deterministic cryptographic hashes, eliminating reliance on ambient time (`Date.now()`) or random placeholders.

```javascript
workflowId = hash({
  workflowSpec,
  normalizedInputs,
  parentArtifacts,
  capabilitySnapshot,
  runtimeVersion,
  workspaceSchemaVersion
})
```
*Rationale:* Policy context, runtime version, and schema version inherently alter execution semantics and must be part of the execution identity.

## 8. Artifact Transaction Semantics (Build / Sign / Broadcast)

Transactions are not "mutated blobs". They progress through explicit, distinct artifact boundaries to ensure auditability, multi-sig capability, offline signing, and cold storage compatibility:
1. `UnsignedTxArtifact`: The raw transaction plan and UTXO selection.
2. `SignedTxArtifact`: The immutable signature payload.
3. `BroadcastReceiptArtifact`: The final network receipt.

## 9. Capability Model vs Policy Rules

HardKAS enforces a strict separation between policies and capabilities:
- **Capabilities (Authority Tokens):** Structural proofs of environmental readiness or L1 state (e.g., wallet mode, Consensus state).
- **Policies (Runtime Rules):** Evaluated constraints on workflows (e.g., `allowNetwork`, `requireDryRun`, `allowMainnet`).

## 10. Strict JSON/Stdout Contract

All CLI commands intended for programmatic use must negotiate their schema version. Pipelines, CI, dashboards, and external tooling depend on this stability.
- Example: `hardkas tx send --json`

## 11. Compatibility Guarantees

- Artifact hashes are strictly stable across supported OSes.
- JSON schemas are explicitly versioned and strictly backward compatible within a major runtime version.
- Rebuild semantics are strictly deterministic across machines.
- Projection formats may evolve freely; artifacts remain the permanent canonical format.

## 12. Self-Healing & Verification Commands

The runtime provides strict, API-driven recovery procedures:
- `hardkas doctor --json`: Programmatic diagnostic of workspace health.
- `hardkas verify --deep`: Cryptographic and causal verification of all artifacts.
- `hardkas rebuild --from-artifacts`: Discard projections and rebuild indices purely from filesystem authority.

## 13. Dashboard Contract

The Dashboard is strictly an observer.
- **Observer-only:** Cannot trigger hidden mutations.
- **No authoritative state:** The dashboard owns no truth.
- **Fully reconstructible:** Can be restarted at any time without data loss.
- **API-driven only:** Communicates with the runtime exclusively through the formal JSON contract and SSE streams.
