# HardKAS 0.8.0-alpha — Targeted Regression Report

**Date:** 2026-06-02  
**SDK:** `@hardkas/sdk@0.8.0-alpha`  
**CLI:** `@hardkas/cli@0.8.0-alpha`  
**Registry:** https://registry.npmjs.org/  
**Node:** v24.15.0  
**Mode:** External workspace (no monorepo, no local links)

---

## Regression Targets

These are the 5 apps that failed or had issues in 0.7.9 / 0.7.10:

| # | App | Bug en 0.7.9 | 0.7.9 | 0.7.10 | 0.7.11 | Veredicto |
|---|-----|-------------|-------|--------|--------|-----------|
| 01 | wallet-backend | `tx.plan()` requería `artifacts.write()` | ❌ FAIL | ✅ PASS | ✅ **PASS** | ✅ Cerrado |
| 07 | game-backend | `network:"simulated"` llamaba RPC externo | ❌ FAIL | ✅ PASS | ✅ **PASS** | ✅ Cerrado |
| 09 | payroll-service | `submitTransaction not implemented` en send | ❌ FAIL | ❌ FAIL | ✅ **PASS** | ✅ Cerrado |
| 11 | dao-multisig-node | multisig sign flow crasheaba | ❌ FAIL | ✅ PASS | ✅ **PASS** | ✅ Cerrado |
| 14 | ci-artifact-verifier | `artifacts.verify()` devolvía false | ❌ FAIL | ❌ FAIL | ❌ **FAIL** | ⚠️ Persiste |

---

## Detalle de Fallos

### APP 14 — ci-artifact-verifier

**Error:**
```
Error: Verification failed
    at run (index.mjs:8:29)
```

**Código ejecutado:**
```js
const plan = await sdk.tx.plan({ from: 'alice', to: 'bob', amount: '1' });
const artifactPath = await sdk.artifacts.write(plan);
const res = await sdk.artifacts.verify(plan.planId);
if (!res.valid) throw new Error("Verification failed");
```

**Análisis:**  
`artifacts.write()` persiste correctamente (1 artifact en disco), pero `artifacts.verify(planId)` no reconoce el artifact escrito o el hash check falla. Posible causa: verify busca por `artifactId` pero recibe `planId`, o el contentHash no coincide después de serialización.

**Severidad:** P2 — No es blocker para flujo tx normal, pero CI/CD pipelines no pueden verificar integridad.

---

## Resultado Parte 1

| Metric | Valor |
|--------|-------|
| Total regression targets | 5 |
| Pasaron | 4 |
| Fallaron | 1 |
| Bugs cerrados vs 0.7.9 | 3 de 5 |
| Bugs cerrados vs 0.7.10 | 1 de 2 (APP 09 ✅) |
| Regresiones nuevas | 0 |

### Veredicto: ⚠️ PARCIAL

- **4/5 targeted regressions pasaron** — mejora significativa.
- APP 14 persiste con fallo, pero **no es regresión nueva** (ya fallaba en 0.7.9 y 0.7.10).
- **0 regresiones nuevas introducidas por 0.7.11.**
- El fix de `tx.send()` en simulated mode funciona correctamente (APP 09 ✅).
