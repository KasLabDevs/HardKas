# Changelog

All notable changes to HardKAS will be documented in this file.

## [v0.7.4-alpha] - 2026-05-29

### Bug Bash & Canonicalization Hotfixes

This release focuses on strict bug fixes discovered during the Agentic E2E Gauntlet and hardening canonicalization rules.

#### Canonicalization (Strict Determinism)

- **Root Undefined Error**: `canonicalStringify(undefined)` now strictly throws an error instead of producing invalid JSON strings, preventing ambiguity at the artifact root.
- **Array Null Handling**: `undefined` values inside arrays are now safely converted to `null` to respect standard JSON serialization formats.
- **Property Omission**: Preserved the semantic exclusion of `undefined` properties in objects for backwards compatibility and correct hash generation.

#### Bug Bash Fixes

- **Workflow Offline/Simulated**: `workflow run` now correctly processes simulated networks offline with a `--timeout` flag, preventing eternal hangs when RPC is missing.
- **Replay Verify Paths**: `hardkas replay verify <path>` strictly respects arbitrary file or directory paths via `fs.statSync` rather than relying on relative magic resolution.
- **Local Accounts Balance**: `hardkas accounts balance --local` now cleanly reads balances directly from `LocalnetState` without querying an RPC node.
- **Dashboard Events**: Emitting `artifact.created` and `tx.confirmed` events during simulated transactions so the local Dashboard updates via SSE instantly.
- **Query SQL Guard**: Enforced SQLite backend checking in `query sql`, emitting actionable migration errors if the default filesystem backend is active.
- **WASM Keypair Errors**: Missing WASM core library (`@kaspa/core-lib`) in key generators now emits an explicit error instead of crashing silently.

## [v0.7.2-alpha] - 2026-05-27

### Stabilization & Refactor

This release focuses on cleaning, consolidating, versioning, and stabilizing the local-first runtime to prepare HardKAS for `0.7.2-alpha`. No new product architectures or fake executions were added. The focus remains on being a local-first, artifact-driven, deterministic, and replayable developer environment.

#### Version Alignment & Documentation

- **0.7.2-alpha:** Unified all package versions and references to `0.7.2-alpha`. Removed stale `0.6.1-alpha` and `0.7.0-CFC` references.
- **Honest Documentation:** Aggressively purged unsupported claims (e.g., "production ready", "trustless exit without ZK", "Kaspa L1 executes EVM"). Re-centered the messaging strictly around HardKAS being a "local-first reproducible Kaspa developer runtime."

#### Runtime Contract Freeze

- **Schema Versions:** Injected `schemaVersion` fields into all core runtime contracts (`hardkas.artifact.v1`, `hardkas.receipt.v1`, `hardkas.txPlan.v1`, etc.) to establish a stable structural baseline.
- **Backwards Compatibility:** Maintained compatibility for older workspaces without `schemaVersion`.

#### CLI Semantics

- **JSON Standardization:** Audited and tightened CLI commands in `--json` mode to guarantee pure, parsable JSON to `stdout` with no ANSI escapes.
- **Error Routing:** Enforced strict routing of warnings and diagnostic errors to `stderr` in JSON mode.
- **Exit Codes:** Ensured deterministic exit codes for invalid flags, missing arguments, and unsupported commands.

#### Artifacts & Corpus

- **Golden Corpus:** Populated `packages/testing/src/fixtures/golden/` with baseline JSON files representing minimum required fixtures to prevent semantic regressions.
- **Output Standardization:** Adjusted `hardkas artifact inspect`, `hardkas replay verify`, and `hardkas torture matrix` string outputs to be fully deterministic (`passed`, `diverged`, `unsupported`).

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
