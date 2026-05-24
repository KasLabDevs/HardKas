# HardKAS Architectural & Determinism Audit

## Executive Summary
This audit identifies critical failures in HardKAS's determinism and security infrastructure. The most serious finding (P0) is the **inability to produce reproducible artifacts** due to the inclusion of timestamps and randomness in the calculation of canonical hashes. This invalidates the framework's "Deterministic-by-Design" pillar. Furthermore, "Security Theater" risks have been detected in session management, and technical debt in the indexing engine compromises CLI scalability.

---

## 1. Determinism

### [P0] Non-Deterministic Artifact Hashing & IDs
- **Problem**: [OUTDATED FINDING RESOLVED] Content hashes (`contentHash`) were including variable metadata.
- **Resolution**: `createdAt` and `planId` are now excluded from the canonical hash in `artifact/src/canonical.ts`.
- **Complexity**: Small
- **Category**: Architectural debt / Code problem

### [P1] Silent Non-Determinism in Query Indexer
- **Problem**: The indexer (`query-store/src/indexer.ts`) recalculates hashes if missing, but the calculation process depends on the installed SDK version, not the original artifact state.
- **Why it matters**: If the hashing algorithm changes, the SQLite index silently becomes inconsistent with the file system.
- **Minimal fix**: The indexer should treat the JSON `contentHash` as the sole source of truth and mark any file where the recalculated hash does not match the declared one as `corrupted`.
- **Complexity**: Trivial
- **Category**: Architectural debt

---

## 2. Security & Runtime

### [P1] Security Theater: Fake Session Locking
- **Problem**: The `hardkas accounts real lock` command only prints a console message (`Account locked`). No daemon or persistent process exists to keep keys in memory, so the "lock" is purely cosmetic.
- **Why it matters**: It gives a false sense of security to the developer, who might believe their private key has been removed from an active execution context when it was never "live" outside the invoked command.
- **Minimal fix**: Either implement a real `HardkasSignerDaemon` or change the message to clarify that there are no active sessions in the CLI (`No active session to lock`).
- **Complexity**: Trivial (Message fix) / Large (Daemon)
- **Category**: Security risk / DX issue

### [P1] Secret Redaction Gap in Error Handlers
- **Problem**: [OUTDATED FINDING RESOLVED] full error messages were exposed.
- **Resolution**: `maskSecrets` is now integrated into `handleError` and all `UI` methods.
- **Complexity**: Small
- **Category**: Security risk

---

## 3. Query Layer & Observability

### [P2] Hardcoded Explain Logic
- **Problem**: The query engine (`query/src/engine.ts`) returns a hardcoded `executionPlan` (`["Discovery", "Filter", "Sort", "Paginate"]`) for all adapters.
- **Why it matters**: It invalidates the deep introspection feature. The user believes they are seeing the real execution plan when it is a static stub.
- **Minimal fix**: Allow each `QueryAdapter` to return its own plan of steps during execution.
- **Complexity**: Small
- **Category**: DX issue

### [P2] Destructive Schema Migrations
- **Problem**: `query-store/src/db.ts` uses a "Drop and Recreate" strategy upon any schema version mismatch.
- **Why it matters**: Developers lose all their operational history (indexed `events.jsonl`, traces of past workflows) simply by updating the CLI.
- **Minimal fix**: Implement an incremental migration system (e.g., `UP/DOWN` scripts) or, at least, force an automatic `rebuild` without deleting user metadata if possible.
- **Complexity**: Medium
- **Category**: Architectural debt

---

## 4. Documentation & CLI Coherence

### [P2] Outdated "What Actually Works" Document
- **Problem**: `docs/what-actually-works.md` lists `Query Store (SQLite)` as **BROKEN / UNWIRED**, but the code already has it connected by default.
- **Why it matters**: New users will ignore the framework's introspection capabilities, believing they are non-functional.
- **Minimal fix**: Synchronize the document with the real state of PR #102 (Store wiring).
- **Complexity**: Trivial
- **Category**: Documentation problem

### [P3] Zombie Command Suggestion in Doctor
- **Problem**: [OUTDATED FINDING RESOLVED] `hardkas doctor` was suggesting a non-existent command.
- **Resolution**: Command names have been aligned to `hardkas query store rebuild`.
- **Complexity**: Trivial
- **Category**: DX issue

---

## 5. Summary of Findings

| Status | Count | P0/P1 Severity |
| :--- | :--- | :--- |
| **P0 (Critical)** | 1 | Artifact Determinism |
| **P1 (High)** | 3 | Secret Redaction, Fake Locking, Indexer Integrity |
| **P2 (Medium)** | 3 | Explain stubs, Schema migrations, Outdated docs |
| **P3 (Low)** | 1 | Doctor suggestions |

---

## 6. Recommendations

### Immediate (Next 24h)
1. **Fix Hashing (P0)**: Exclude variable metadata from the canonical hash to enable stable CI/CD.
2. **Fix Doctor (P3)**: Align command names to avoid "Unknown command" errors.

### Hardening (Current Sprint)
1. **RedactSecrets (P1)**: Add the security filter to `handleError`.
2. **Wired Docs (P2)**: Declare the Query Engine as functional to incentivize community testing.

---

## 7. Guardrails
- Runtime logic was not modified.
- Runners were not modified.
- Internal packages were not modified.
- The diagnosis is based on source code inspection and compliance with the "Deterministic-by-Design" architecture.
