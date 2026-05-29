# HardKAS Architectural Specification & Operator Guides

Welcome to the canonical HardKAS developer specification. This directory contains the authoritative runtime invariants, workstation security models, and operator guides.

---

## 🏛️ 1. Canonical Specifications (`docs/canonical/`)

The core engineering specs and mathematical invariants that govern the HardKAS runtime:

- **[Runtime Architecture](file:///absolute/path/to/repo/docs/canonical/architecture.md)**: Filesystem authority axioms, SQLite caching boundaries, and local simulation limits.
- **[Deterministic Replay Specification](file:///absolute/path/to/repo/docs/canonical/replay.md)**: Causal pre-state time-travel rollback math and isolated sandbox executions.
- **[Deterministic Guarantees & Boundaries](file:///absolute/path/to/repo/docs/canonical/deterministic-guarantees.md)**: Exact plan identities, sorting rules, and critical non-guarantees (consensus bounds, RPC limits).
- **[Workstation Security Model](file:///absolute/path/to/repo/docs/canonical/workstation-model.md)**: CSRF isolation, Host verification whitelists, CORS limits, and DNS rebinding mitigations.
- **[Semantic Vocabulary Canon](file:///absolute/path/to/repo/docs/canonical/semantic-vocabulary.md)**: The single, authoritative glossary for core terms (Artifact, Projection, Replay, Snapshot, Stale).

---

## 🧭 2. Operator Guides (`docs/guides/`)

Practical playbooks for installing, orchestrating, and diagnostic-debugging:

- **[Operator Getting Started](file:///absolute/path/to/repo/docs/guides/getting-started.md)**: Scaffolding, funding simulated accounts, and planning offline transactions.
- **[Sandboxed Workflows Guide](file:///absolute/path/to/repo/docs/guides/workflows.md)**: Running orchestrations, sandbox policies, and causal diff audit trails.
- **[State Snapshot Management](file:///absolute/path/to/repo/docs/guides/snapshots.md)**: Capturing virtual state, snapshot invariants, and time-travel replay triggers.
- **[Replay Debugging & Diagnostics](file:///absolute/path/to/repo/docs/guides/replay-debugging.md)**: Handling `preStateHash` mismatches, fee deviations, and dynamic causal inspection.
- **[Dashboard & Dev-Server Operations](file:///absolute/path/to/repo/docs/guides/dashboard.md)**: Localbackground processes, REST endpoint tokens, and SSE reactive projections.

---

## 🏛️ 3. Archival History (`docs/history/`)

Preserves the historical stabilization evolution:

- `docs/history/p0/`: Phase 0 CLI command audits and early command runner restructures.
- `docs/history/p1/`: Phase 1 timeline revisions and keystore audits.
- `docs/history/burn-in/`: Early stabilization telemetry records.
- `docs/history/reports/`: Full E2E E2E and visual validation results.
- `docs/history/migrations/`: Early configuration and release logs.
