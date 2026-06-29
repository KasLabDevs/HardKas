
## [0.11.0-alpha] - 2026-06-29 — The First Local-First Application Runtime
### Added
- **Backend Plugin Architecture**: Introduced `@hardkas/plugin-rpc-backend` (V1) to transparently connect `IndexerToolkit` to real Docker `simnet` and `testnet` nodes without altering the SDK facade.
- **Native BigInt Standardization**: All monetary values (balances, fees, amounts) and consensus values (blue scores) are now strongly typed as `bigint` across all Toolkits to eliminate floating-point imprecision.
- **Performance Baselines**: Comprehensive benchmarking (`tinybench` via `vitest bench`) established for massive DAG ingestion (50k blocks), UTXO consolidations (50k outputs), and Jobs throughput (>5M ops/sec).
- **DX & Documentation**: Completely revamped onboarding with `ZERO_TO_APP_WALKTHROUGH.md` and explicit `known-limitations.md`. `hardkas init` templates now correctly use the `bigint` standards.

### Fixed
- Fixed WebSocket drop errors on Windows Docker environments by ensuring safe fallback behavior in the RPC backend loop.
- Ensured snapshots capture clear metadata stubs when utilizing an external RPC backend where complete DAG cloning isn't feasible.

### Validated
- Full gauntlet (build, test, docs, templates, packaging) successfully verified across 36 internal workspace packages.
- Docker long-run continuous stress tests confirmed no major heap leaks in local orchestrations.

## [0.11.0-alpha] - 2026-06-27 — Toolkit Baseline
### Added
- `@hardkas/toolkit` — High-level facade: WalletToolkit, PaymentToolkit, IndexerToolkit, JobsToolkit.
- `@hardkas/jobs` — Local-first job runner with progress, checkpoints, and retry (no Redis/BullMQ).
- `DomainStoreJson<T>` in `@hardkas/query-store` — Generic domain persistence primitive.
- `InvoiceStoreJson` in `@hardkas/toolkit/stores` — Domain-aware invoice persistence.
- Official templates: `wallet-backend`, `merchant-checkout`, `payment-service`, `full-stack-demo`.
- Builder Book v2: 8 chapters following the real development journey.
- API examples in `docs/examples/api/` for all four Toolkits.
- `API_SURFACE_TOOLKIT_BASELINE.md` — Public API snapshot for future compatibility tracking.

### Fixed
- Coverage infra ENOENT: `coverage/internal/.tmp/` now pre-created in `vitest.config.ts`.
- `docs:verify-book` preflight check ensures `pnpm build` ran before executing book blocks.

### Validated
- Labs 01–09.5 validated the complete SDK lifecycle.
- Full release gauntlet (build, test, docs, templates, packaging) passes with exit 0.

## [0.11.0-alpha] - 2026-06-26
### Added
- P24 API Freeze definitions for public, experimental, and deprecated surfaces.
- Strict verifier gates for ecosystem templates.

### Changed
- Bumbed all package versions to 0.11.0-alpha.
- Enforced strict artifact verification and encryption references (`keystoreRef`).

### Removed
- Legacy plaintext keystore support.


## [0.11.0-alpha] - 2026-06-26
### Added
- P24 API Freeze definitions for public, experimental, and deprecated surfaces.
- Strict verifier gates for ecosystem templates.

### Changed
- Bumbed all package versions to 0.11.0-alpha.
- Enforced strict artifact verification and encryption references (`keystoreRef`).

### Removed
- Legacy plaintext keystore support.


## [0.11.0-alpha] - 2026-06-26
### Added
- P24 API Freeze definitions for public, experimental, and deprecated surfaces.
- Strict verifier gates for ecosystem templates.

### Changed
- Bumbed all package versions to 0.11.0-alpha.
- Enforced strict artifact verification and encryption references (`keystoreRef`).

### Removed
- Legacy plaintext keystore support.


## [0.11.0-alpha] - 2026-06-26
### Added
- P24 API Freeze definitions for public, experimental, and deprecated surfaces.
- Strict verifier gates for ecosystem templates.

### Changed
- Bumbed all package versions to 0.11.0-alpha.
- Enforced strict artifact verification and encryption references (`keystoreRef`).

### Removed
- Legacy plaintext keystore support.


## [0.11.0-alpha] - 2026-06-26
### Added
- P24 API Freeze definitions for public, experimental, and deprecated surfaces.
- Strict verifier gates for ecosystem templates.

### Changed
- Bumbed all package versions to 0.11.0-alpha.
- Enforced strict artifact verification and encryption references (`keystoreRef`).

### Removed
- Legacy plaintext keystore support.


## [0.11.0-alpha] - 2026-06-26
### Added
- P24 API Freeze definitions for public, experimental, and deprecated surfaces.
- Strict verifier gates for ecosystem templates.

### Changed
- Bumbed all package versions to 0.11.0-alpha.
- Enforced strict artifact verification and encryption references (`keystoreRef`).

### Removed
- Legacy plaintext keystore support.


## [0.11.0-alpha] - 2026-06-26
### Added
- P24 API Freeze definitions for public, experimental, and deprecated surfaces.
- Strict verifier gates for ecosystem templates.

### Changed
- Bumbed all package versions to 0.11.0-alpha.
- Enforced strict artifact verification and encryption references (`keystoreRef`).

### Removed
- Legacy plaintext keystore support.


## [0.11.0-alpha] - 2026-06-26
### Added
- P24 API Freeze definitions for public, experimental, and deprecated surfaces.
- Strict verifier gates for ecosystem templates.

### Changed
- Bumbed all package versions to 0.11.0-alpha.
- Enforced strict artifact verification and encryption references (`keystoreRef`).

### Removed
- Legacy plaintext keystore support.

# HardKAS 0.11.0-alpha Release Notes

**Status:** `LOCAL_FIRST_DEVELOPER_RUNTIME_HARDENED` (Release Candidate)

This release concludes a major phase of local-first developer runtime hardening (P1 through P6). The goal of this phase was to ensure that developers have a deterministic, reproducible, and secure experience when building Kaspa-native applications locally against a simulated docker node (Toccata).

We explicitly do **NOT** claim `PRODUCTION_READY`, `TESTNET_READY`, `MAINNET_READY`, `L2_READY`, or `BRIDGE_READY`. Those networks remain `BLOCKED_BY_POLICY` for the happy path. 

## Milestones Achieved

- **P1: JSON Normalization & Mode Labels**
  All CLI outputs are now strictly JSON-compliant. A reality mode label (`SIMULATED`, `LOCAL_DOCKER`, etc.) is guaranteed on all outputs so orchestrators know the precise execution context.
- **P2: Capability Matrix & Documentation**
  Explicit tracking of what HardKAS can do, what modes are supported, and crucially, what is *not* claimed. The documentation boundaries are now clear.
- **P3: Localnet Funding UX**
  Implemented safe local-first shadow identities (`alice.localnet`). Developers can now smoothly fund accounts against the local Docker instance (`localnet fund alice`) without mutating or risking their primary Kaspa keystores.
- **P4: Reality Labels Across Transactions**
  Strict isolation between simulated transactions and real local docker transactions. Developers always know exactly where a transaction was planned, signed, and broadcasted.
- **P5: E2E Docker TX Lifecycle**
  A complete and fully verified transaction lifecycle against the Toccata localnet Docker container. From starting the network to funding, planning, signing, sending, querying the balance, and tearing down safely.
- **P6: Reproducible Install & Recovery**
  Hardened the system against sudden failures. The system cleanly manages state via a query store and correctly recovers gracefully from abrupt container terminations. Key handling enforces strict `0600` file permissions and redacts secrets from all JSON logs to prevent leakage in CI pipelines. 
- **P7: Version Boundary Alignment**
  A synchronized `0.11.0-alpha` version line across all packages, generated capabilities schemas, CLI help menus, and documentation.

## Core Commitments
If you are building locally, HardKAS provides a safe and deterministic sandbox. If you are aiming for Mainnet or Testnet, those flows require custom guards and are deliberately outside the standard developer workflow provided by this release.


# Changelog

All notable changes to HardKAS will be documented in this file.

## 0.11.0-alpha - Deployed & Builder-Ready - 2026-06-11

HardKAS `0.11.0-alpha` has successfully passed the Extreme Builder Gauntlet. This release marks our transition from raw engineering pipelines into a fully usable **Builder Layer** experience for Kaspa.

### Key Highlights
- **100% External Consumer Validation**: This release was completely verified from outside the monorepo, consuming the actual NPM registry packages.
- **Robust Localnet & Docker Integration**: Flawless detached node lifecycle (`hardkas localnet start --toccata --detached`), auto-funding (`hardkas localnet fund`), and tx simulation.
- **Query Store Safety**: The query store backend now aggressively blocks any unsafe local mutations.
- **Dev-Server Auth**: The dashboard local API is secured via bearer tokens (`dev-server token --json`) and enforces strict host validations.
- **Zero Raw Exceptions**: The entire CLI and SDK surfaces guarantee clear, structured error codes with deterministic JSON outputs.

### Fixes & Refinements since 0.9.3
- Addressed all CLI frictions reported during dogfooding.
- Ensured trailing whitespaces and strict semantic consistency across `vProgs` and `ZK` corpus boundaries.
- Upgraded testing harnesses to guarantee no forbidden protocol claims leak into the `alpha` CLI output.

## 0.11.0-alpha - CI Fixes + Query-Store SQL Repair - 2026-06-11

TypeScript typecheck fixes across CLI silver commands and query-store SQL
parameter binding. No new features, no protocol claim expansion.

Fixes:
- `HardkasCliError` options now accept `cause?: unknown` (runners fix)
- `silver.ts`, `silver-lifecycle.ts`, `silver-discovery.ts`: TS errors resolved
  (dead code, `createTransaction` 7-arg signature, `requestRaw` private cast,
  `provider` not in `HardkasOptions`, nullish guards)
- `tx.ts`: `writeLine()` → `writeLine("")`
- `query-store/indexer.ts`, `backend.ts`: `HardkasSchemas.*` in SQL strings
  replaced with `?` parameterized queries
- `core/test/registry.test.ts`: circular `@hardkas/artifacts` import removed
- Golden `queryResultHash` updated to reflect correct `findTraces` output

### Release Discipline Fixes
- `bump-version.mjs` must not rewrite golden corpus fixtures or cryptographic artifact JSON.
- Golden corpus artifacts remain content-addressed and version-stable unless an intentional hash migration is documented.
- Gauntlet/test workspaces must generate their own `hardkas.config.ts` to avoid accidental parent-directory configuration discovery.

### Final Audit State
- `DEEP_AUDIT_COMPLETED`
- `DOGFOODING_FINDINGS_TRIAGED`
- `DOGFOODING_MINOR_FIX_APPLIED`
- `DOGFOODING_REGRESSION_TESTS_READY`
- `FULL_LOCAL_GAUNTLET_PASS`
- `POSTRELEASE_BREAK_PASS`
- `GIT_DIFF_CHECK_PASS`
- `HARDKAS_0_9_3_ALPHA_DOGFOOD_READY`

## 0.9.1-alpha - SDK Parity + Programmability Builder Surface - 2026-06-10

### SDK Parity

`0.9.1-alpha` is a developer-experience patch for the previous Toccata
local-first baseline. It does not add mainnet, testnet, new protocol claims, or
VM/consensus equivalence.

Added SDK parity surfaces:

- `await hardkas.capabilities()`
- `await hardkas.localnet.status({ profile: "toccata-v2" })`
- `await hardkas.localnet.start({ profile })`
- `await hardkas.localnet.fund("alice", { profile })`
- `await hardkas.corpus.verify("fixtures/toccata-v2/silver")`
- `await hardkas.silver.compile({ file })`
- `await hardkas.silver.deployPlan({ artifact, from })`
- `await hardkas.silver.deploy({ artifact })`
- `await hardkas.silver.spendPlan({ receipt, args, to })`
- `await hardkas.silver.spend({ artifact })`
- `await hardkas.silver.simulate.deploy(...)`
- `await hardkas.silver.simulate.spend(...)`
- `await hardkas.silver.compare(...)`

### Boundaries Kept

- `artifactCoherence`: READY_MATCH
- `runtimeOutcome`: PARTIAL
- `vmConsensusEquivalence`: NOT_CLAIMED
- `mainnet`: BLOCKED_BY_POLICY

SDK Toccata Docker funding/start and real Silver RPC deploy/spend remain bounded
in `0.9.1-alpha`; the SDK returns explicit unsupported statuses/errors for
those host-runtime actions instead of pretending consensus or Docker control
parity. CLI/localnet remains the certified path for Docker Toccata real
lifecycle execution.

SDK real Silver RPC/Docker execution remains explicitly unsupported in
`0.9.1-alpha` via `SDK_SILVER_REAL_LIFECYCLE_UNSUPPORTED`; certified real
lifecycle execution remains CLI/localnet bounded.

### Programmability Builder Surface

Added a local-only programmability builder surface with SDK parity. It covers
SilverScript builder workflows, ZK corpus fixture coherence, and vProgs artifact
inspection. It does not add stable protocol/runtime claims.

Added CLI surfaces:

- `hardkas zk capabilities --json`
- `hardkas zk proof inspect <path> --json`
- `hardkas zk proof verify-local <path> --json`
- `hardkas zk corpus verify fixtures/toccata-v2/zk --json`
- `hardkas vprogs capabilities --json`
- `hardkas vprogs status --json`
- `hardkas vprogs inspect <artifact> --json`
- `hardkas programmability capabilities --json`
- `hardkas programmability corpus verify fixtures/toccata-v2 --json`
- `hardkas programmability inspect <path> --kind silver|zk|vprog --json`
- `hardkas programmability app plan --kind full-lab --json`

Added SDK surfaces:

- `await hardkas.zk.capabilities()`
- `await hardkas.zk.proof.inspect(path)`
- `await hardkas.zk.proof.verifyLocal(path)`
- `await hardkas.zk.corpus.verify(path)`
- `await hardkas.vprogs.capabilities()`
- `await hardkas.vprogs.status()`
- `await hardkas.vprogs.inspect(path)`
- `await hardkas.programmability.capabilities()`
- `await hardkas.programmability.corpus.verify({ path })`
- `await hardkas.programmability.inspect({ kind, path })`
- `await hardkas.programmability.app.plan({ kind })`

Added fixtures and scripts:

- `fixtures/toccata-v2/zk` with Groth16 fixture-coherence corpus and RISC0
  inspect-only corpus.
- `fixtures/toccata-v2/vprogs/inspect-only-artifact.json`.
- `pnpm zk:corpus`.
- `pnpm vprogs:check`.
- `pnpm programmability:corpus`.
- `pnpm programmability:examples`.
- `pnpm programmability:templates`.
- `pnpm programmability:surface`.

Builder surface boundaries:

- SilverScript builder status is `SILVERSCRIPT_BUILDER_READY`.
- ZK corpus status is `ZK_CORPUS_SURFACE_READY`.
- Groth16 verification is local fixture coherence only, not a production
  cryptographic setup or on-chain verifier claim.
- RISC0 local verification returns
  `RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED` /
  `RISC0_VERIFIER_UNAVAILABLE` in 0.9.1-alpha.
- vProgs artifact inspection status is `VPROGS_INSPECT_SURFACE_READY`.
- `ZK_ONCHAIN_VERIFICATION_NOT_CLAIMED`.
- `VPROGS_STABLE_API_NOT_CLAIMED`.
- No mainnet, bridge, trustless exit, full vProgs runtime, or VM/consensus
  equivalence claim is added.

### Validation

- SDK parity tests added for capabilities, localnet status, corpus verify, and
  Silver planning/simulation/compare.
- `pnpm postrelease:break` reports CLI/SDK parity PASS for capabilities,
  localnet status, accounts list, corpus verify, and Silver high-level
  planning/simulation/compare.
- No new mainnet, custody, VM simulation, consensus validation, or trustless
  bridge claim is made.

## 0.9.0-alpha - Toccata Local-First Baseline - 2026-06-09

### Toccata v2 Localnet Baseline

HardKAS 0.9.0-alpha includes a normalized Toccata v2 localnet baseline with
Docker simnet funding, real standard transaction lifecycle, real Silver OP_TRUE
deploy/spend, artifact-coherence simulator comparison, mainnet guard
enforcement, and a machine-verifiable golden corpus integrated into the Toccata
gauntlet.

Included:

- Normalized Toccata v2 localnet profile.
- Docker simnet funding fixture.
- Toccata miner/stratum companion integration.
- Standard tx lifecycle real gauntlet.
- SilverScript local OP_TRUE deploy/spend baseline.
- `pnpm gauntlet:toccata` as release gate.
- Mainnet guard remains enforced.

### Release Gates

- `pnpm build`: PASS
- `pnpm test`: PASS
- `pnpm corpus:toccata`: PASS
- `pnpm gauntlet:toccata`: PASS
- CLI tests: 157 PASS
- `git diff --check`: PASS

### Silver/Toccata Simulator Claims

- `artifactCoherence`: READY_MATCH
- `runtimeOutcome`: PARTIAL
- `vmConsensusEquivalence`: NOT_CLAIMED
- `mainnet`: BLOCKED_BY_POLICY

`silver simulate compare` now supports `artifact-coherence`,
`runtime-outcome`, and `strict` modes. The default `artifact-coherence` mode
reports `SILVERSCRIPT_SIMULATION_MATCH` for the golden OP_TRUE flow while
preserving `PARTIAL_VM_SIMULATION` as an explicit known limitation. Full Kaspa
VM or consensus equivalence is not claimed.

Known limitations:

- Runtime outcome simulation is `PARTIAL`.
- Full VM/consensus equivalence is `NOT_CLAIMED`.
- Strict compare may still show runtime identifier drift.
- Mainnet remains `BLOCKED_BY_POLICY`.

### Golden Corpus

- Added a verified OP_TRUE Silver/Toccata corpus under
  `fixtures/toccata-v2/silver/op-true`.
- Added a verified failure corpus under `fixtures/toccata-v2/silver/failures`.
- Added `hardkas corpus verify <path> --json`.
- Added `pnpm corpus:toccata`.
- Integrated corpus verification into `pnpm gauntlet:toccata`.

## [v0.7.7-alpha] - 2026-06-01

### SDK Productization & DX Hardening

This release converts HardKAS from a pure CLI-first runtime into a fully consumable SDK, resolving key frictions identified during the Phase 6 and Phase 7 Gauntlets.

#### Public SDK Facade

- **`Hardkas.create()`**: New programmatic entrypoint for seamless developer orchestration.
- **`tx.*` API**: Added `plan()`, `sign()`, `send()`, and `status()` facade wrappers.
- **`accounts.*` API**: Added `list()`, `balance()`, and `fund()`.
- **`artifacts.*` API**: Added `list()` and `get()` for direct artifact access.

#### Developer Experience (DX)

- **Actionable Errors**: `tx.plan()` now intercepts `--amount 0` for value transfers and throws an actionable message regarding future anchoring capabilities.
- **Alias Resolution**: `--required-signers` now supports clean account aliases (e.g., `alice,bob`) instead of requiring full addresses.
- **Bridge Artifacts**: L2 bridge commands (`local plan` and `simulate`) now natively serialize and persist `hardkas.bridge.localPlan.v1` and `hardkas.bridge.localSimulation.v1` diagnostics, even in uninitialized workspaces.
- **CLI Discovery**: The auto-generated CLI surface documentation (`docs/reference/cli.generated.json`) now recursively parses Commander subcommands and exports `totalCommands` and `flatSurface`, providing accurate coverage tracking for testing pipelines.
- **Node Packaging**: Removed `workspace:*` constraints inside `@hardkas/sdk`, enabling flawless installation in external Node/React projects.

## [v0.7.6-alpha] - 2026-05-29

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

