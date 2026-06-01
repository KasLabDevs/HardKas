# Nightmare Blocker Remediation

**Date:** 2026-05-28
**Sprint Goal:** Fix the two release blockers found by the Nightmare Suite before tagging `0.7.7-alpha`.

## Executive Summary

The HardKAS Nightmare Suite identified two critical operational blockers during the adversarial testing phase. Both blockers have been fully resolved without introducing broad architectural changes or regressions. The system correctly identifies complex artifact corruption vectors, and gracefully degrades under extreme SQLite contention without native crashes.

## Blocker 1: Duplicate Artifact Detection Bypass

**Issue:** A developer manually copied an artifact JSON file, creating two physical files with the same internal ID and canonical hash. `hardkas dev doctor` reported the workspace as OK, completely bypassing detection of physical duplication.

**Remediation:**

- Added a targeted filesystem sweep within `dev doctor` specifically scanning `.hardkas/artifacts/` for `.json` files.
- Implemented four strict collision rules:
  1. `DUPLICATE_ARTIFACT_ID`: Same `artifactId`, same `hash`, multiple paths.
  2. `ARTIFACT_ID_HASH_CONFLICT`: Same `artifactId`, different `hash`.
  3. `DUPLICATE_ARTIFACT_HASH`: Different `artifactId`, same `hash`.
  4. `MALFORMED_ARTIFACT`: Unparseable JSON.
- Guaranteed `dev doctor` returns `failed` status and exit code `1` when any of these conditions are met, ensuring CI/CD pipelines correctly fail.

## Blocker 2: Windows/Native Crash under Extreme SQLite Contention

**Issue:** Extreme parallel contention (`hardkas dev doctor` + `hardkas rebuild`) against the projection database caused the underlying `node:sqlite` driver to trigger a native access violation (`STATUS_STACK_BUFFER_OVERRUN`), instantly crashing the Node process.

**Remediation:**

- Defensive wrapping applied around `DatabaseSync` instantiations in `@hardkas/query-store`.
- Adjusted CLI runners (`rebuild`, `dev doctor`) to explicitly handle projection contention.
- `dev doctor` now falls back to a read-only store connection. If the projection is unavailable (`PROJECTION_BUSY`), it correctly issues a `PROJECTION_UNAVAILABLE` warning, continues validating artifacts, and avoids triggering a native crash or falsely failing the workspace.
- `rebuild` now catches `PROJECTION_BUSY` errors prior to attempting lock operations, returning a structured error (`PROJECTION_REBUILD_BUSY`) with exit code `1`.

## Validation

- **Nightmare Regression Suite:** Both blockers were codified into the Nightmare Suite.
  - `DuplicateArtifactRegression`: Verified that `dev doctor` successfully detects all four corrupted artifact profiles.
  - `ParallelHellMiniRegression`: Validated that intense concurrent read/write operations against the projection layer result in graceful warnings rather than fatal runtime crashes.
- **Project Test Suite:** Full monorepo pass (`136/136` tests) for `@hardkas/cli`.

**Status:** ALL BLOCKERS RESOLVED. Ready for `0.7.7-alpha` release.
