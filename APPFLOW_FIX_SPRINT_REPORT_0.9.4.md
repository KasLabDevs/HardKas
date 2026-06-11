# HardKAS 0.9.4-alpha AppFlow Fix Sprint Report

## Executive Summary
The 0.9.4-alpha Fix Sprint focused on addressing the MAJOR and MINOR friction points identified during the `APP FLOW DISCOVERY` phase. The fixes prioritize robust builder UX, strict adherence to established schemas, and safety-first default behaviors. No new protocol features, mainnet interactions, or unversioned artifact structural changes were introduced.

## Fixes Implemented

### 1. MAJOR-001 — Dev Server local frontend auth UX
- **Issue**: The local frontend was unable to consume the Dev Server API securely without resorting to `--unsafe-external`.
- **Fix**:
  - Implemented `hardkas dev-server start --dashboard` to natively support local auth flows.
  - Implemented `hardkas dev-server token --json` for headless/scripted ephemeral token retrieval.
  - Retained strict `CORS` and `Host` guards (127.0.0.1 default) to ensure local security.
  - Added `--unsafe-no-auth` with `--yes` required as an explicit escape hatch for advanced/isolated testing, maintaining safety-first defaults.

### 2. MAJOR-002 — SDK Configuration Path Resolution
- **Issue**: SDK logic assumed `config.cwd` was correctly populated or fell back to module-relative paths, causing resolution failures in external projects.
- **Fix**:
  - Centralized path resolution in `@hardkas/config` to dependably anchor to `process.cwd()`.
  - Added deterministic fallback mechanisms prioritizing explicit `workspaceRoot` and `configPath` arguments.

### 3. MAJOR-003 — vProgs Schema Strictness
- **Issue**: `vprogs inspect` lacked robust schema enforcement and was outputting undefined JSON.
- **Fix**:
  - Enforced `HardkasSchemas.VProgsInspectV1` schema validation inside `vprogs.ts`.
  - Throws `VPROGS_ARTIFACT_SCHEMA_INVALID` to provide immediate, actionable feedback when the schema contract is breached.

### 4. MINOR-001 — ZK Verify-Local UX
- **Issue**: The `zk verify-local` command name and output lacked clarity.
- **Fix**:
  - Renamed the command to `verify` with an alias for `verify-local`.
  - Updated error output to explicitly state `Failed to cryptographically verify local ZK proof fixture`.

### 5. MINOR-002 — Silver Compile JSON UX
- **Issue**: Missing `silverc` generated raw Node.js errors and lacked JSON support.
- **Fix**:
  - Added `--json` support to `silver compile`.
  - Added specific error `SILVER_COMPILER_NOT_FOUND` in JSON mode when the compiler is missing.

### 6. MINOR-003 / MINOR-004 — Localnet UX Polish
- **Issue**: `localnet fund` was incapable of parsing keychain aliases, and localnet lacked a graceful stop mechanism.
- **Fix**:
  - Updated `localnet fund` resolution to match the canonical order: 1) Keychain, 2) Fixtures, 3) Dev accounts, 4) Literals.
  - Added `hardkas localnet stop` to gracefully teardown the simulated node and miner.

### 7. MINOR-005 / MINOR-006 — Query & Account Command Consistency
- **Issue**: Subcommand help texts and aliases lacked standardization.
- **Fix**:
  - Added standard `ls` alias to `query artifacts list` and `query replay list`.
  - Updated `localnet account create` help text to reflect `alpha` maturity status.

### 8. INFO — Docs & Examples
- **Issue**: SilverScript tooling lacked local documentation, and `tx batch` needed a reference example.
- **Fix**:
  - Added `SilverScript Setup` instructions to `docs/getting-started/installation.md`.
  - Created `examples/workflows/batch-transfer.json` as a reference `tx batch` implementation.

## Current State
- `APPFLOW_0_9_4_FIX_SPRINT_READY`
- `FULL_LOCAL_GAUNTLET_PASS`
- All regression tests pass locally.
