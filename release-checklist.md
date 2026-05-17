# HardKAS Release Checklist

This checklist must be completed and verified before any public or private Release Candidate (RC) tag.

## 1. Quality Gates
- [x] `pnpm typecheck` passes with no errors in any package.
- [x] `pnpm build` completes successfully for the entire monorepo.
- [x] `pnpm test` passes 100% across all packages.
- [x] `pnpm example:ci` passes (validates user-facing workflow examples).
- [x] `pnpm example:dag-reorg` passes (validates complex simulation logic).

## 2. Artifact Integrity
- [x] `hardkas artifact verify packages/artifacts/test/fixtures/golden --strict` passes.
- [x] Recursive verification of `fixtures/corrupted` correctly rejects all items.

## 3. Distribution Integrity
- [x] `pnpm pack` verification for core packages:
    - [x] `@hardkas/cli`: contains `dist`, `README.md`, correct `bin`.
    - [x] `@hardkas/sdk`: contains `dist`, `types`.
    - [x] `@hardkas/artifacts`: contains `dist`, `types`.
    - [x] `@hardkas/tx-builder`: contains `dist`, `types`.
    - [x] `@hardkas/accounts`: contains `dist`, `types`.

## 4. Repository Hygiene
- [x] `git status` is clean (no untracked files intended for inclusion).
- [x] No temporary files (`scratch/`, `test-artifacts/`, etc.) in root.
- [x] No plaintext secrets or keystores committed.
- [x] `.gitignore` is up to date.

## 5. Automated Confidence
- [x] GitHub Actions CI is **Green** for the target branch/commit.

## 6. Documentation
- [x] `README.md` version matches `package.json`.
- [x] `SECURITY.md` is present.
- [x] `v0.3.0-alpha` banners are updated in CLI output.
