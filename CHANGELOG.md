# Changelog

All notable changes to HardKAS will be documented in this file.

## [v0.5.6-alpha-rc.1] - 2026-05-22

### Architecture (P0 & P1 Series)
This release candidate consolidates HardKAS from a deterministic runtime into a deterministic runtime that can securely explain itself. The major focus was establishing state authority, observability, and robust introspection tooling.

#### P0: State Authority Consolidation
- **Filesystem as Primary Authority**: Removed SQLite as a state authority. SQLite now functions strictly as a projection/cache layer.
- **Deterministic State Boundaries**: Clarified state boundaries and ensured reproducible replay paths.
- **Unified Event Invalidation**: Consolidated the event invalidation lifecycle.

#### P1: Observability & Introspection
- **Event Timeline**: Added a comprehensive `EventsPage` dashboard for diagnosing state mutations and operations.
- **Provenance Graph**: Added a visual causal lineage tree (`ProvenanceGraph`) inside the dashboard to track the evolution of state via `lineageIds`.
- **Consistency Visibility**: Added deterministic debugging and visibility tooling to expose broken causality explicitly rather than hiding it.

#### P1.5: Runtime Introspection Hardening
- **Replay Honesty**: Upgraded transaction replay architecture to detect divergences between structural state, deterministic parameters (e.g. amounts, hashes), and runtime noise (e.g. timestamps).
- **Corrupted Artifact Handling**: Added a robust banner (`ArtifactCorruptedBanner`) to the dashboard ensuring corrupted state is never silently skipped or projected.
- **Strict Consistency Doctor**: Added the `--strict` and `--consistency` flags to `hardkas doctor` which actively validates filesystem invariance and halts operations if integrity is breached.

#### P1.6: Visual Regression Hardening
- **Playwright Suite**: Transitioned dashboard UI testing to Playwright with a full visual-regression baseline using deterministic mock fixtures (`pnpm test:visual:ci`).
- **Resilient Locators**: Stabilized visual tests with fallback logic and explicit states.

#### P1.7: Stabilization Burn-In
- **Burn-In Validation**: Performed deep verification of the snapshot/replay system to prove SQLite could be deterministically dropped and correctly re-derived from `.hardkas/artifacts`.
- **Noise vs Determinism Testing**: Validated `hardkas replay diff` successfully categorizing execution timestamp shifts as "Runtime Noise (Layer 3)" and mutation changes as "Deterministic Divergences (Layer 2)".
- **UI Render Stability**: Confirmed SSE reconnects and complex lineage trees render performantly.

### Breaking Changes
- **SQLite Projection Purge**: Because SQLite is no longer authoritative, running `hardkas query store rebuild` or a `snapshot replay` will forcibly truncate the SQLite cache and completely rebuild it from `.hardkas/artifacts`. Any data written to SQLite outside of the deterministic event loop will be destroyed.
- **Simnet Network Alias Deprecation**: The `simnet` network alias is deprecated in favor of `simulated` for local deterministic workflows.

### Migration Notes
- If your previous workspace relied on SQLite as the primary source of truth rather than `.hardkas/artifacts`, you may experience a `[ARTIFACT_HASH_MISMATCH]` during the next startup as the system synchronizes state. Run `hardkas doctor --consistency --strict` to inspect filesystem anomalies.

### Known Limitations
- Please refer to `KNOWN_LIMITATIONS.md` for full documentation regarding the boundaries of replay determinism, snapshot guarantees, and tooling applicability.
