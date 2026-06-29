# P42_5_STABILIZATION_FIXES_READY

## Status: PASS
## Date: 2026-06-27

## Fixes Applied

### 1. Coverage Infra ENOENT
**Root cause**: Vitest v8 coverage provider writes temp files to `reportsDirectory/.tmp/` but doesn't create the directory. With parallel test workers, the race condition causes `ENOENT` on `coverage/internal/.tmp/coverage-NNN.json`.

**Fix**: Added `mkdirSync("./coverage/internal/.tmp", { recursive: true })` at the top of `vitest.config.ts`, before the config is exported.

**File**: `vitest.config.ts`

### 2. docs:verify-book Legacy Chapter Failure
**Root cause**: `02-install-and-init.md` block 2 runs `hardkas config show` which internally imports `@hardkas/sdk`. When `docs:verify-book` ran concurrently with `pnpm build`, the CLI's bundled code couldn't resolve the SDK dist because it wasn't built yet.

**Fix**: Added a preflight check in `scripts/verify-book.ts` that verifies `sdk/dist/index.js`, `cli/dist/index.js`, and `core/dist/index.js` exist before executing any book blocks. If missing, exits with a clear message: "Run 'pnpm build' before 'docs:verify-book'."

**File**: `scripts/verify-book.ts`

## Release Hardening Gauntlet — All Clean Exit 0

| Check | Status | Exit Code |
|---|---|---|
| `pnpm build` | ✅ PASS | 0 — 35/35 packages |
| `pnpm test` | ✅ PASS | 0 — all tests pass, no ENOENT |
| `pnpm docs:verify-book` | ✅ PASS | 0 — 22 blocks, 8 chapters |
| `pnpm templates:verify` | ✅ PASS | 0 — 3/3 templates with evidence |
| `pnpm packaging:smoke` | ✅ PASS | 0 — 26 tarballs, no workspace:* leaks |

## Summary
Zero known CI issues remain. The gauntlet is fully green with real exit 0 on all five checks.
