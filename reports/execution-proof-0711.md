# HardKAS 0.8.1-alpha — Execution Proof

**Generated:** 2026-06-02T00:54:00+02:00

---

## Environment

| Key | Value |
|-----|-------|
| npm registry | https://registry.npmjs.org/ |
| sdk version resolved | `@hardkas/sdk@0.8.1-alpha` |
| cli version resolved | `@hardkas/cli@0.8.1-alpha` |
| node version | v24.15.0 |
| OS | Windows 11 |
| total duration | ~11m 30s (20 apps × ~35s avg) |
| workspace | `external-gauntlet-runs/` (outside monorepo) |

---

## Isolation Guarantees

| Rule | Enforced |
|------|----------|
| no local packages | ✅ `npm install` from registry |
| no monorepo imports | ✅ workspace outside repo |
| no tgz local | ✅ no `file:` or `link:` refs |
| no link local | ✅ no `npm link` |
| no tsx interno | ✅ `node index.mjs` only |
| no app modification during run | ✅ apps defined before execution |

---

## Execution Method

```
Script: scripts/run-revenge-gauntlet.mjs
Workspace: ../external-gauntlet-runs/
Install command: npm install @hardkas/sdk@0.8.1-alpha @hardkas/cli@0.8.1-alpha
Init command: npx @hardkas/cli init . --skip-install
Run command: node index.mjs
```

Each app was:
1. Created in an isolated directory
2. Dependencies installed fresh from npm
3. Workspace initialized via CLI
4. Executed without modification

---

## Results Summary

| Metric | Value |
|--------|-------|
| Total apps | 20 |
| SUCCESS | 16 |
| FAILED | 4 |
| Pass rate | 80% |
| Regressions vs 0.7.9 | 0 |
| Improvements vs 0.7.9 | +4 |
| Artifacts generated | 16 total across 5 apps |

---

## Version Progression

| Version | Pass Rate | Delta |
|---------|-----------|-------|
| 0.7.9 | 12/20 (60%) | baseline |
| 0.7.10 | 13/20 (65%) | +1 |
| **0.7.11** | **16/20 (80%)** | **+4** |

---

## Remaining Failures (Non-Regressions)

All 4 failures existed in 0.7.9 or are known gaps:

1. **APP 06, 10**: `@hardkas/react` package not published to npm
2. **APP 14**: `artifacts.verify()` hash mismatch bug
3. **APP 20**: `unsignedPayloadHash` not exposed on plan (Kastj feature gap)

**Zero new regressions introduced by 0.8.1-alpha.**
