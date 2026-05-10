# HardKas CLI Runners Audit

## 1. Scope
Este documento presenta una auditoría exhaustiva de todos los runners implementados en el paquete `@hardkas/cli`. Se han analizado 53 archivos bajo la ruta `packages/cli/src/runners/*`, evaluando su lógica interna, dependencias de red/IO, producción de artefactos y nivel de estabilidad funcional.

## 2. Method
1. **Enumeración**: Identificación de todos los archivos `.ts` en la carpeta de runners.
2. **Análisis de Código**: Revisión de importaciones para detectar dependencias de paquetes internos (`@hardkas/*`) y externos.
3. **Mapeo**: Relación entre runners y los comandos CLI que los invocan.
4. **Side Effects**: Identificación de escrituras en disco, llamadas RPC, interacción con Docker y acceso al Keystore.
5. **Clasificación**: Aplicación de la taxonomía (REAL, WRAPPER, PARTIAL, MOCK, EXPERIMENTAL).

## 3. Runner Inventory

| Runner file | Export(s) | Commands using it | Internal packages | Stability | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `up-runner.ts` | `runUp` | `hardkas up` | `@hardkas/config` | `REAL` | Valida entorno y conectividad RPC |
| `tx-plan-runner.ts` | `runTxPlan` | `hardkas tx plan` | `tx-builder`, `artifacts` | `REAL` | Orquesta obtención de UTXOs y construcción de plan |
| `tx-profile-runner.ts` | `runTxProfile` | `hardkas tx profile` | `tx-builder`, `artifacts` | `REAL` | Análisis de costos y masa |
| `tx-sign-runner.ts` | `runTxSign` | `hardkas tx sign` | `accounts`, `artifacts` | `WRAPPER` | Delega firma a `@hardkas/accounts` |
| `tx-send-runner.ts` | `runTxSend` | `hardkas tx send` | `kaspa-rpc`, `localnet` | `REAL` | Broadcast real a red/simulador |
| `tx-receipt-runner.ts` | `runTxReceipt` | `hardkas tx receipt` | `kaspa-rpc` | `REAL` | Consulta RPC de TX ID |
| `tx-flow.ts` | `runTxFlow` | `hardkas tx send` (shortcut) | Varios | `REAL` | Orquestador de flujo completo Plan-Sign-Send |
| `accounts-keystore-runners.ts` | `runAccountsKeystore*`| `hardkas accounts real *` | `accounts` | `REAL` | Gestión de Argon2id/AES |
| `accounts-real-init-runner.ts` | `runAccountsRealInit` | `hardkas accounts real init` | `accounts` | `REAL` | Inicializa el store físico del Keystore |
| `accounts-real-generate-runner.ts`| `runAccountsRealGenerate`| `accounts real generate` | `sdk` | `REAL` | Generación de llaves Kaspa deterministas |
| `l2-tx-runners.ts` | `runL2Tx*` | `hardkas l2 tx *` | `l2` | `REAL` | Funcional para build/sign/send/status; conserva mensajes desfasados |
| `node-start-runner.ts` | `runNodeStart` | `hardkas node start` | `node-runner` | `REAL` | Orquestación Docker de nodos |
| `dag-runners.ts` | `runDag*` | `hardkas dag *` | `localnet` | `PARTIAL` | Basado en light-model simulado |
| `artifact-verify-runner.ts` | `runArtifactVerify` | `hardkas artifact verify` | `artifacts` | `REAL` | Validación Zod de integridad de esquemas |
| `artifact-explain-runner.ts` | `runArtifactExplain` | `hardkas artifact explain` | `artifacts` | `EXPERIMENTAL` | Análisis semántico de artefactos |
| `trace-runner.ts` | `runTrace` | `hardkas tx trace` (unused) | `localnet` | `PARTIAL` | **UNUSED**: Comando asociado deshabilitado |
| `test.ts` (inline) | — | `hardkas test` | — | `MOCK` | Sin runner, output hardcodeado estático |

## 4. Runner → Command Map

| Command | Runner | Runner file | Role | Produces artifact | Consumes artifact | Network/IO dependency |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `tx plan` | `runTxPlan` | `tx-plan-runner.ts` | Builder | `txPlan` | None | config, localnet/RPC |
| `tx sign` | `runTxSign` | `tx-sign-runner.ts` | Signer | `signedTx` | `txPlan` | keystore |
| `tx send` | `runTxSend` | `tx-send-runner.ts` | Broadcaster | `txReceipt` | `signedTx` | RPC, localnet, FS |
| `l2 tx build` | `runL2TxBuild` | `l2-tx-runners.ts` | Builder | `l2TxPlan` | None | L2 RPC |
| `node start` | `runNodeStart` | `node-start-runner.ts` | Orchestrator | None | None | Docker |
| `doctor` | `runDoctor` | `rpc-doctor-runner.ts` | Diagnostic | None | None | mixed |

## 5. Side Effects Audit

| Runner | Filesystem writes | Network calls | Docker calls | Keystore access | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `runTxSend` | Yes (Receipts/Trace) | Yes (RPC) | No | No | **HIGH** (Broadcast) |
| `runL2TxSend` | Yes (L2 Artifacts) | Yes (L2 RPC) | No | No | **HIGH** (L2 Broadcast) |
| `runTxSign` | No | No | No | Yes | **HIGH** (Signing) |
| `runL2TxSign` | No | No | No | Yes | **HIGH** (L2 Signing) |
| `runAccountsKeystoreImport` | Yes (Keystore JSON) | No | No | Yes (Argon2) | **HIGH** (Key handling) |
| `runAccountsKeystoreChangePassword` | Yes (Keystore JSON) | No | No | Yes | **HIGH** (Key migration) |
| `runNodeReset` | Yes (Data removal) | No | Yes | No | **HIGH** (Data loss) |
| `runSnapshotRestore` | Yes (Localnet state) | No | No | No | **HIGH** (State rewrite) |
| `runAccountsFund` | Yes (Localnet state) | No | No | No | **HIGH** (Faucet/Sim) |

## 6. Artifact Audit

| Runner | Produces | Consumes | Schema / Type | Deterministic | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `runTxPlan` | `txPlan` | None | `hardkas.txPlan` | Yes | Orquestación de selección de UTXOs |
| `runTxSign` | `signedTx` | `txPlan` | `hardkas.signedTx` | Yes | Criptografía Kaspa |
| `runTxSend` | `txReceipt` | `signedTx` | `hardkas.txReceipt` | No | Contiene txId y timestamp real |
| `runL2TxBuild` | `l2TxPlan` | None | `hardkas.l2TxPlan` | Yes | Planificación EVM |
| `runSnapshotRestore`| None | `snapshot` | `hardkas.snapshot` | Yes | Restauración determinista de estado |

## 7. Mock / Partial / Unused Detection

| Runner | Evidence | Classification | Action recommended |
| :--- | :--- | :--- | :--- |
| (Command) | `hardkas test` (inline) | `MOCK` | Implementar runner real con Vitest. |
| `dag-runners.ts` | `"Minimal v0.2-alpha implementation"` | `PARTIAL` | Expandir lógica de GHOSTDAG simulado. |
| `accounts.ts` | Lock/Session model | `PARTIAL` | Implementar gestión de sesión real. |
| `l2-tx-runners.ts` | Mensaje de next step desfasado | **REAL with stale UX hint** | Corregir mensaje; el soporte send ya existe. |
| `trace-runner.ts` | Comando asociado deshabilitado | **UNUSED** | Integrar con Query Engine o eliminar. |

## 8. Stability Classification Summary

| Stability | Count | Runners |
| :--- | :--- | :--- |
| `REAL` | 43 | tx (6), l2 (1), accounts (11), rpc (6), node (6), snapshot/replay (4), etc. |
| `WRAPPER` | 3 | tx-sign, node-stop, node-logs |
| `PARTIAL` | 4 | dag (2), trace (1), accounts-lock (1) |
| `EXPERIMENTAL` | 3 | artifact explain/lineage, tx verify |
| `MOCK` | 1 | test (inline command) |

## 9. Architecture Issues Found

- **Responsibility Mixing**: Los runners actuales mezclan orquestación, formateo de salida (`formatted` strings), persistencia de artefactos y, en ocasiones, lógica de negocio profunda.
- **Lógica de Negocio Atrapada**: `runTxPlan` y `runTxFlow` contienen lógica de planificación que debería residir exclusivamente en `@hardkas/tx-builder` o `@hardkas/sdk`.
- **Startup Latency**: Las dependencias pesadas se importan estáticamente en la mayoría de los archivos de runner.

## 10. Recommendations

### Critical
- **Real Test Runner**: Sustituir el mock de `hardkas test` por un runner real basado en Vitest.
- **Confirmation Guards**: Implementar validaciones de seguridad en runners destructivos o de broadcast (`node reset`, `tx send`, `l2 tx send`, `accounts real import`).

### High
- **Orchestration-Only Runners (v1)**: Rediseñar los runners para que se limiten a orquestar servicios de paquetes internos:
    - La lógica de negocio va a los **Packages**.
    - La persistencia de artefactos va a un **Artifact Service**.
    - El formateo de salida va a un **Output Adapter**.
- **SDK Migration**: Asegurar que la lógica de selección y obtención de UTXOs sea 100% accesible desde el SDK.

## 11. Proposed Runner Architecture v1

```typescript
// Architecture: Clean Orchestration Runner
export async function runTxPlan(ctx: RunnerContext, input: TxPlanInput): Promise<RunnerResult<TxPlanArtifact>> {
  // 1. Business Logic (delegated to SDK/Package)
  const plan = await ctx.sdk.tx.planPayment(input);
  
  // 2. Artifact Persistence (delegated to Service)
  const artifact = await ctx.services.artifacts.create("txPlan", plan);
  
  // 3. Return Raw Result (formatting is done by CLI adapter)
  return {
    success: true,
    data: artifact
  };
}
```

## 12. Checklist

- [x] Detectar mocks
- [x] Clasificar estabilidad real/partial
- [x] Detectar side effects críticos
- [x] Proponer arquitectura v1
- [x] No modificar lógica runtime
- [x] No modificar runners
- [x] No modificar packages internos

## Guardrails

- No se modificó lógica runtime.
- No se modificaron runners.
- No se modificaron comandos.
- No se modificaron packages internos.
- Esta auditoría es documental.
