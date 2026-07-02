# Cleanup Report — 2026-07-02

## Deleted (Group A — generated/artifacts/temp)

### Root-level generated reports and data
- `COVERAGE_DELTA_REPORT.md`
- `COVERAGE_DELTA_REPORT_V2.md`
- `COVERAGE_SUPERAPP_REPORT.md`
- `PRODUCTION_CHECKLIST.md`
- `PUBLIC_API_COVERAGE_MATRIX.md`
- `PUBLIC_API_COVERAGE_MATRIX_UPDATED.md`
- `coverage-summary.json`
- `kaspad-go.zip`
- `rusty-kaspa.zip`

### Binary / compiled output directories
- `bin/`
- `bin_go/`

### Empty directories
- `rusty-kaspa-src/` (was empty)
- `labs/18-observability-telemetry/` (was empty)

### examples/showcase-suite — generated content only (source preserved)
- `examples/showcase-suite/coverage/`
- `examples/showcase-suite/.hardkas-data/`
- `examples/showcase-suite/node_modules/`
- `examples/showcase-suite/coverage-summary.json`
- `examples/showcase-suite/API_DEAD_ZONE_REPORT.md`
- `examples/showcase-suite/FULL_ECOSYSTEM_COVERAGE_REPORT.md`
- `examples/showcase-suite/PACKAGE_USAGE_MATRIX.md`
- `examples/showcase-suite/SHOWCASE_EXECUTION_REPORT.md`
- `examples/showcase-suite/SHOWCASE_SUITE_READY.md`

### examples/superapp-command-center — generated content only (source preserved)
- `examples/superapp-command-center/coverage/`
- `examples/superapp-command-center/node_modules/`
- `examples/superapp-command-center/frontend/node_modules/`

### examples/reference-apps/testnet-runner — runtime data only (source preserved)
- `examples/reference-apps/testnet-runner/node_modules/`
- `examples/reference-apps/testnet-runner/.hardkas/`
- `examples/reference-apps/testnet-runner/TESTNET_SOAK_REPORT.json`
- `examples/reference-apps/testnet-runner/testnet.db`
- `examples/reference-apps/testnet-runner/sync.json`
- `examples/reference-apps/testnet-runner/jobs.json`

---

## Kept — Real Source Code (Group E — untouched)

- `packages/observability/` — real package: health.ts, logger.ts, metrics.ts, prometheus.ts, tracing.ts
- `packages/cli/src/commands/env.ts` — real CLI command
- `packages/sync-daemon/test/` — real integration tests
- `examples/showcase-suite/apps/`, `packages/`, `scripts/`, `tests/`, config files
- `examples/superapp-command-center/backend/src/`, `frontend/src/`
- `examples/reference-apps/testnet-runner/test-metrics.ts`, `src/`, `package.json`, `tsconfig.json`
- `examples/reference-apps/testnet-runner/.env.example`

---

## Kept — Archive (Group B — historical validation, intentional)

- `docs/archive/` — 13 P-series validation docs (P63/P65/P66/Toccata), REAL_L1_TRANSACTION_VALIDATED.md

---

## Group D — Sospechosos (listed, NOT deleted — needs human review)

These are untracked files that are neither clearly source nor clearly generated artifacts. They document past lab sessions and may or may not be worth keeping.

| Path | Description | Recommendation |
|------|-------------|----------------|
| `labs/16-full-docker-runtime-gauntlet/*.ts` | 11 test scripts from P61 Docker gauntlet | Keep if documenting the gauntlet approach; delete if lab is concluded |
| `labs/17-toccata-v1-foundation/test-v1-surface.ts` | Toccata V1 surface test | Keep as reference for Toccata work |
| `Dockerfile` | Generic Node.js app template (not repo-critical) | Delete or replace with proper compose |
| `docker-compose.yml` | Generic app template | Delete or replace |
| `scripts/bootstrap-showcase.mjs` | Showcase bootstrapping script | Keep if showcase-suite still needs it |
| `scripts/generate-coverage-reports.mjs` | Coverage report generator | Keep if reports will be regenerated |
| `scripts/generate-p66-1-reports.mjs` | P66 phase 1 report generator | Low value now P66 is complete |
| `scripts/generate-p66-2-reports.mjs` | P66 phase 2 report generator | Low value now P66 is complete |

---

## .gitignore additions

Added the following patterns to `.gitignore`:
- `/coverage-summary.json`, `/COVERAGE_*.md`, `/PUBLIC_API_COVERAGE_MATRIX*.md`, `/PRODUCTION_CHECKLIST.md`, `/audit-full-results/`
- `/bin/`, `/bin_go/`
- `/*.zip`, `/rusty-kaspa-src/`
- `examples/**/coverage/`, `examples/**/.hardkas/`, `examples/**/.hardkas-data/`, `examples/**/node_modules/`
- `examples/**/testnet.db`, `examples/**/sync.json`, `examples/**/jobs.json`, `examples/**/TESTNET_SOAK_REPORT.json`

---

## Remaining git status (untracked)

After cleanup, remaining untracked items that should be tracked or reviewed:

```
.env.example              ← template, track it
Dockerfile                ← Group D
docker-compose.yml        ← Group D
docs/archive/             ← track (historical validation)
examples/reference-apps/testnet-runner/  ← track source
examples/showcase-suite/  ← track source
examples/superapp-command-center/        ← track source
labs/16-full-docker-runtime-gauntlet/    ← Group D
labs/17-toccata-v1-foundation/           ← Group D
packages/cli/src/commands/env.ts         ← track (real source)
packages/observability/                  ← track (real package)
packages/sync-daemon/test/               ← track (real tests)
scripts/bootstrap-showcase.mjs           ← Group D
scripts/generate-*.mjs                   ← Group D
```
