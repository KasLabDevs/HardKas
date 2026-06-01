# Package Dry Run Report

## Overview

This report validates the release tarball for `@hardkas/cli` (and corresponding packages) to guarantee that zero dirty development artifacts or internal telemetry files leak into the distributed NPM package.

## Execution

We executed `npm pack --dry-run --json` against the fully compiled packages.

## Integrity Verifications

- **No Scratch Workspaces:** The bundled contents exclude all `.hardkas`, `.hardkas-chaos`, and `.test-workspace` directories.
- **No Reports/Logs Leakage:** The `reports/` and `logs/` directories are successfully ignored.
- **Compiled Assets Only:** The tarball exclusively includes `dist/`, `package.json`, `LICENSE`, and `README.md`.
- **Dependency Map:** No missing cross-workspace aliases leaked as unresolved during the pack simulation.

**Verdict:** PASS
