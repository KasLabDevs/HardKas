# HardKas CLI Version Audit

## 1. Scope
This audit analyzes versioning discrepancies between the package manifest (`package.json`), the CLI entry point (`index.ts`), and artifact metadata (`@hardkas/artifacts`).

## 2. Comparison Table

| Source | Detected value | File | Status |
| :--- | :--- | :--- | :--- |
| **CLI Manifest** | `0.2.2-alpha.1` | `packages/cli/package.json` | `MATCH` |
| **CLI Runtime** | `0.2.2-alpha.1` | `packages/cli/src/index.ts` | `MATCH` |
| **Artifact Metadata**| `0.2.2-alpha.1` | `packages/artifacts/src/constants.ts` | `MATCH` |
| **CLI Output** | `0.2.2-alpha.1` | `hardkas --version` | `MATCH` |

## 3. Hardcoded Version References

| File | Reference | Type | Action |
| :--- | :--- | :--- | :--- |
| `packages/cli/src/index.ts` | `const { version: HARDKAS_VERSION } = ...` | runtime dynamic | **FIXED** |
| `packages/artifacts/src/constants.ts` | `export const HARDKAS_VERSION = "0.2.2-alpha.1";` | package hardcode | Validated by sync script |
| `packages/cli/package.json` | `"version": "0.2.2-alpha.1"` | manifest | **Source of Truth** |
| `packages/artifacts/package.json` | `"version": "0.2.2-alpha.1"` | manifest | Validated by sync script |

## 4. Problem Statement
There are at least two duplicated string constants for the version in the source code. If a developer updates `package.json` but forgets to update the constants, generated artifacts and CLI output will report incorrect versions.

## 5. Proposed Solution
1. **CLI**: Read `version` dynamically from `packages/cli/package.json` in `index.ts`.
2. **Artifacts**: Maintain the constant for now to avoid breaking changes in artifact signatures, but add validation to ensure it matches the package.
3. **Sync Script**: Create `scripts/check-cli-version.mjs` to validate consistency in CI.

## 6. Checklist
- [x] Compare package.json vs CLI output
- [x] Detect hardcodes
- [x] Centralize version in CLI
- [x] Add automatic sync
- [x] Add check:cli-version script
- [x] No modifications to command logic
- [x] No modifications to runners
- [x] No modifications to unrelated internal packages

## Guardrails
No modifications to command logic.
No modifications to runners.
No changes to published versions.
No packages published.
The change is limited to CLI versioning, validation, and documentation.
