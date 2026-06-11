# Release Notes: 0.9.4-alpha

## Overview

0.9.4-alpha represents a Post-Release Hardening Cycle focused on Dogfooding and Audit Fixes. The cycle strictly maintained the boundaries of HardKAS as a tooling/SDK/builder layer without expanding protocol, mainnet, bridge, or VM consensus equivalence claims.

## Release Discipline Fixes

- `bump-version.mjs` must not rewrite golden corpus fixtures or cryptographic artifact JSON.
- Golden corpus artifacts remain content-addressed and version-stable unless an intentional hash migration is documented.
- Gauntlet/test workspaces must generate their own `hardkas.config.ts` to avoid accidental parent-directory configuration discovery.

## Status

The full local gauntlet, including the real-node simulation and post-release destruct tests, successfully passed.

- `DEEP_AUDIT_COMPLETED`
- `DOGFOODING_FINDINGS_TRIAGED`
- `DOGFOODING_MINOR_FIX_APPLIED`
- `DOGFOODING_REGRESSION_TESTS_READY`
- `FULL_LOCAL_GAUNTLET_PASS`
- `POSTRELEASE_BREAK_PASS`
- `GIT_DIFF_CHECK_PASS`
- `HARDKAS_0_9_3_ALPHA_DOGFOOD_READY`
