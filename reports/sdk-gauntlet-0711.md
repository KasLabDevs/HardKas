# HardKAS 0.7.12-alpha — SDK Gauntlet Report (20 Apps)

**Date:** 2026-06-02  
**SDK:** `@hardkas/sdk@0.7.12-alpha`  
**CLI:** `@hardkas/cli@0.7.12-alpha`  
**Registry:** https://registry.npmjs.org/  
**Node:** v24.15.0  
**Total Duration:** ~11m 30s  
**Mode:** External workspace, npm install real

---

## Full Results

| # | App | Type | 0.7.9 | 0.7.11 | Artifacts | Time | Error |
|---|-----|------|-------|--------|-----------|------|-------|
| 01 | wallet-backend | node | ❌ | ✅ SUCCESS | 3 | 41.4s | — |
| 02 | react-wallet | react | ✅ | ✅ SUCCESS | 0 | 31.5s | — |
| 03 | audit-explorer-node | node | ✅ | ✅ SUCCESS | 0 | 34.1s | — |
| 04 | audit-explorer-react | react | ✅ | ✅ SUCCESS | 0 | 28.0s | — |
| 05 | document-notary-node | node | ✅ | ✅ SUCCESS | 0 | 38.0s | — |
| 06 | document-notary-react | react | ❌ | ❌ FAILED | 0 | 33.0s | `@hardkas/react` missing |
| 07 | game-backend | node | ❌ | ✅ SUCCESS | 0 | 27.9s | — |
| 08 | game-dashboard | react | ✅ | ✅ SUCCESS | 0 | 36.5s | — |
| 09 | payroll-service | node | ❌ | ✅ SUCCESS | 3 | 32.6s | — |
| 10 | payroll-ui | react | ❌ | ❌ FAILED | 0 | 39.4s | `@hardkas/react` missing |
| 11 | dao-multisig-node | node | ❌ | ✅ SUCCESS | 4 | 44.6s | — |
| 12 | dao-dashboard | react | ✅ | ✅ SUCCESS | 0 | 31.3s | — |
| 13 | backup-integrity | node | ❌ | ✅ SUCCESS | 5 | 38.3s | — |
| 14 | ci-artifact-verifier | node | ❌ | ❌ FAILED | 1 | 29.4s | `verify()` returns false |
| 15 | agent-wallet | node | ✅ | ✅ SUCCESS | 0 | 30.0s | — |
| 16 | agent-approval-flow | node | ✅ | ✅ SUCCESS | 0 | 30.2s | — |
| 17 | mini-indexer | node | ✅ | ✅ SUCCESS | 0 | 34.8s | — |
| 18 | query-store-test | node | ✅ | ✅ SUCCESS | 0 | 32.0s | — |
| 19 | dashboard-integration | react | ✅ | ✅ SUCCESS | 0 | 36.9s | — |
| 20 | kastj-migration-spike | node | ❌ | ❌ FAILED | 0 | 38.9s | `unsignedPayloadHash` missing |

---

## Score Comparison

| Version | SUCCESS | FAILED | Pass Rate |
|---------|---------|--------|-----------|
| 0.7.7 | — | — | baseline |
| 0.7.9 | 12 | 8 | 60% |
| **0.7.11** | **16** | **4** | **80%** |

**Delta 0.7.9 → 0.7.11: +4 apps fixed, 0 regressions**

---

## Failure Analysis

### Category 1: Missing Package (2 apps)
| App | Issue | Severity | Fix |
|-----|-------|----------|-----|
| 06-document-notary-react | `@hardkas/react` not on npm | P2 | Publish `@hardkas/react` package |
| 10-payroll-ui | `@hardkas/react` not on npm | P2 | Same |

### Category 2: API Gap (1 app)
| App | Issue | Severity | Fix |
|-----|-------|----------|-----|
| 20-kastj-migration-spike | `plan.unsignedPayloadHash` not exposed | P3 | Expose Kastj-compatible hash on plan artifact |

### Category 3: Bug (1 app)
| App | Issue | Severity | Fix |
|-----|-------|----------|-----|
| 14-ci-artifact-verifier | `artifacts.verify()` returns `{valid: false}` | P2 | Fix verify hash check or planId→artifactId mapping |

---

## Artifact Generation

| App | Artifacts Written |
|-----|-------------------|
| 01-wallet-backend | 3 (plan, signed, receipt) |
| 09-payroll-service | 3 (plan, signed, receipt) |
| 11-dao-multisig-node | 4 (plan, sig1, sig2, receipt) |
| 13-backup-integrity | 5 (plan, written, signed, receipt, replay) |
| 14-ci-artifact-verifier | 1 (plan written, but verify failed) |

---

## Veredicto

✅ **Objetivo cumplido:** 16/20 SUCCESS (80%) — superó el target de 15+.  
✅ **0 regresiones nuevas** introducidas por 0.7.11.  
✅ **Fix tx.send() simulated** validado (APP 09).  
⚠️ 4 fallos restantes son pre-existentes o gaps conocidos, no regresiones.
