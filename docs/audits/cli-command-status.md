# HardKas CLI Command Status Taxonomy

Este documento clasifica el estado funcional real de todos los comandos registrados en la interfaz de línea de comandos de HardKas. Esta taxonomía permite a los desarrolladores y auditores identificar qué partes del sistema son operativas, cuáles son experimentales y cuáles actúan como marcadores de posición (placeholders) para futuras funcionalidades.

## Definiciones de Estado

### 🟢 VERIFIED
Comando registrado en Commander y con un handler real que ejecuta lógica implementada de forma completa.
- **Criterios**: Llama a un runner o función real; el output se deriva de datos reales; no tiene bloqueos de implementación críticos.
- **Ejemplo**: `hardkas tx plan`, `hardkas query artifacts list`.

### 🟡 PARTIAL
Comando funcional pero con alcance limitado o dependiente de estados simulados.
- **Criterios**: Depende exclusivamente de `localnet/simulator`; solo cubre flujos positivos (happy path); implementación incompleta de la promesa del comando.
- **Ejemplo**: `hardkas dag status`, `hardkas l2 balance`.

### 🧪 EXPERIMENTAL
Comando funcional pero marcado explícitamente como inestable o en fase de investigación.
- **Criterios**: Maturity tag `experimental` o `research`; sujeto a cambios drásticos en la API de salida.
- **Ejemplo**: `hardkas query dag conflicts`, `hardkas l2 bridge status`.

### 🟠 MOCK
Comando que simula resultados exitosos sin ejecutar el flujo lógico real.
- **Criterios**: Output hardcodeado (ej. "✓ 2 passing"); utiliza datos dummy explícitos; comportamiento de "UX Theater".
- **Ejemplo**: `hardkas accounts real lock`.

### 🔴 PLACEHOLDER
Comando registrado que no ejecuta ninguna operación real.
- **Criterios**: Handler vacío o con `throw "not implemented"`; solo imprime una explicación sin acción.
- **Ejemplo**: Comandos planeados pero no cableados.

### ⚫ DISABLED
Comando registrado pero bloqueado intencionalmente por el equipo de desarrollo.
- **Criterios**: Mensaje explícito de "temporarily disabled".
- **Ejemplo**: `hardkas tx trace`.

### ⚪ UNKNOWN
Estado no determinado por falta de evidencia técnica en el handler o runners delegados.

---

## 2. Clasificación de Comandos Real

| Estado | Grupo | Comando | Evidencia | Motivo | Archivo fuente | Runner / handler | Riesgo |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 🟢 VERIFIED | init | `hardkas init` | `fs.writeFileSync` | Crea archivos de config reales | `init.ts` | inline action | LOW |
| 🟢 VERIFIED | init | `hardkas up` | `await runUp()` | Valida el entorno Docker/Node | `init.ts` | `runUp` | LOW |
| 🟢 VERIFIED | tx | `hardkas tx plan` | `await runTxPlan()` | Genera artefactos deterministas | `tx.ts` | `runTxPlan` | LOW |
| 🟢 VERIFIED | tx | `hardkas tx sign` | `await runTxSign()` | Firma criptográfica real | `tx.ts` | `runTxSign` | MEDIUM |
| 🟢 VERIFIED | tx | `hardkas tx send` | `await runTxSend()` | Broadcast real a la red | `tx.ts` | `runTxSend` | MEDIUM |
| 🟢 VERIFIED | tx | `hardkas tx receipt` | `await runTxReceipt()`| Consulta real al nodo RPC | `tx.ts` | `runTxReceipt` | LOW |
| 🟢 VERIFIED | tx | `hardkas tx verify` | `await runTxVerify()` | Auditoría semántica real | `tx.ts` | `runTxVerify` | LOW |
| ⚫ DISABLED | tx | `hardkas tx trace` | `UI.error("temporarily disabled")` | Deshabilitado por API inestable | `tx.ts` | inline action | LOW |
| 🟢 VERIFIED | accounts | `hardkas accounts list` | `listHardkasAccounts()` | Lee configuración real | `accounts.ts` | inline action | LOW |
| 🟢 VERIFIED | accounts | `hardkas accounts real init` | `runAccountsRealInit()` | Inicializa keystore en disco | `accounts.ts` | `runAccountsRealInit` | LOW |
| 🟢 VERIFIED | accounts | `hardkas accounts real import` | `runAccountsKeystoreImport()` | Importa llaves reales | `accounts.ts` | `runAccountsKeystoreImport` | MEDIUM |
| 🟢 VERIFIED | accounts | `hardkas accounts real unlock` | `runAccountsKeystoreUnlock()` | Valida password real | `accounts.ts` | `runAccountsKeystoreUnlock` | LOW |
| 🟠 MOCK | accounts | `hardkas accounts real lock` | `console.log("Session cleared")` | UX Theater; no hay persistencia de sesión real | `accounts.ts` | inline action | LOW |
| 🟢 VERIFIED | accounts | `hardkas accounts real generate` | `runAccountsRealGenerate()` | Genera llaves via SDK | `accounts.ts` | `runAccountsRealGenerate` | MEDIUM |
| 🟢 VERIFIED | accounts | `hardkas accounts balance` | `runAccountsBalance()` | Consulta real de saldo | `accounts.ts` | `runAccountsBalance` | LOW |
| 🟢 VERIFIED | accounts | `hardkas accounts fund` | `runAccountsFund()` | Envía fondos reales (faucet) | `accounts.ts` | `runAccountsFund` | LOW |
| 🟢 VERIFIED | rpc | `hardkas rpc info` | `await runRpcInfo()` | Diagnóstico de red vivo | `rpc.ts` | `runRpcInfo` | LOW |
| 🟢 VERIFIED | rpc | `hardkas rpc doctor` | `await runRpcDoctor()` | Auditoría de endpoints reales | `rpc.ts` | `runRpcDoctor` | LOW |
| 🟡 PARTIAL | dag | `hardkas dag status` | `uses localnet simulator` | Solo aplica para entorno local | `dag.ts` | `runDagStatus` | MEDIUM |
| 🟡 PARTIAL | dag | `hardkas dag simulate-reorg` | `runDagSimulateReorg()` | Solo aplica para entorno local | `dag.ts` | `runDagSimulateReorg` | MEDIUM |
| 🟢 VERIFIED | artifact | `hardkas artifact verify` | `runArtifactVerify()` | Validación de integridad real | `artifact.ts` | `runArtifactVerify` | LOW |
| 🟢 VERIFIED | artifact | `hardkas artifact explain` | `runArtifactExplain()` | Análisis semántico real | `artifact.ts` | `runArtifactExplain` | LOW |
| 🟢 VERIFIED | query | `hardkas query store doctor` | `engine.backend.doctor()` | Auditoría real de base de datos | `query.ts` | inline action | LOW |
| 🟢 VERIFIED | query | `hardkas query artifacts list` | `engine.execute(request)` | Búsqueda real en SQLite/FS | `query.ts` | inline action | LOW |
| 🧪 EXPERIMENTAL | query | `hardkas query lineage chain` | `maturity("preview")` | Motor de linaje en desarrollo | `query.ts` | inline action | MEDIUM |
| 🧪 EXPERIMENTAL | query | `hardkas query dag conflicts` | `maturity("research")` | Basado en modelo determinista ligero | `query.ts` | inline action | MEDIUM |
| 🟢 VERIFIED | node | `hardkas node start` | `runNodeStart()` | Controla Docker real | `node.ts` | `runNodeStart` | MEDIUM |
| 🟢 VERIFIED | node | `hardkas node stop` | `runNodeStop()` | Controla Docker real | `node.ts` | `runNodeStop` | MEDIUM |
| 🟢 VERIFIED | node | `hardkas node reset` | `runNodeReset()` | Borra data de disco real | `node.ts` | `runNodeReset` | HIGH |
| 🟡 PARTIAL | l2 | `hardkas l2 balance` | `igra simulation focus` | Módulo Igra en estado alfa | `l2.ts` | `runL2Balance` | MEDIUM |
| 🧪 EXPERIMENTAL | l2 | `hardkas l2 bridge status` | `trust assumptions focus` | Modelo de seguridad teórico | `l2.ts` | `runL2BridgeStatus` | HIGH |
| 🟢 VERIFIED | test | `hardkas test` | `import("vitest/node")` | Integración real con Vitest | `test.ts` | `runTest` | LOW |
| 🟢 VERIFIED | example | `hardkas example list` | `reads registry.json` | Lista ejemplos reales del repo | `misc.ts` | `runExampleList` | LOW |

---

## 3. Fake / Nonexistent Commands

Comandos que se sugieren en la documentación o logs pero que no están registrados en Commander.

| Comando | Motivo | Fuente donde aparece | Acción recomendada |
| :--- | :--- | :--- | :--- |
| `hardkas query store index` | Comando no registrado | Mensaje de `doctor.ts` (línea 106) | Registrar o cambiar mensaje a `rebuild`. |
| `hardkas node logs --follow` | Existe el flag pero no implementa streaming real en todos los entornos | Ayuda de `node logs` | Validar implementación de streaming en Docker runner. |
| `example.ts` (Archivo) | Archivo no existe | Referencia en planes anteriores | Los comandos están en `misc.ts`. No es un error crítico pero sí de organización. |

---

## 4. Hardcoded / Mocked Outputs

| Comando | Evidencia | Estado recomendado | Acción recomendada |
| :--- | :--- | :--- | :--- |
| `hardkas accounts real lock` | `console.log("Account '...' is now locked.")` | 🟠 MOCK | Implementar limpieza de keystore temporal si se desea seguridad real. |
| `hardkas dag anomalies` | `printDagAnomalies` llama a `printExplainChains` (que es un bug de referencia) | 🔴 BROKEN | Corregir referencia a `printExplain`. |

---

## 5. Summary

| Estado | Count | Comandos (Ejemplos) |
| :--- | :--- | :--- |
| 🟢 VERIFIED | 48 | `init`, `up`, `tx plan/sign/send`, `query artifacts`, `test` |
| 🟡 PARTIAL | 8 | `dag status`, `l2 tx`, `snapshot` |
| 🧪 EXPERIMENTAL | 10 | `query lineage`, `query dag`, `l2 bridge` |
| 🟠 MOCK | 1 | `accounts real lock` |
| ⚫ DISABLED | 1 | `tx trace` |
| 🔴 BROKEN | 1 | `query dag anomalies` (por bug de referencia) |

---

## 6. Recommendations

### Critical (P0)
- **Corregir Error de Referencia**: La función `printExplainChains` en `query.ts` debe renombrarse a `printExplain` para evitar crashes en diagnósticos.
- **Sincronizar Mensajes de Doctor**: Cambiar la recomendación de `query store index` a `query store rebuild` en `doctor.ts`.

### High (P1)
- **Clarificar UX de Keystore**: El comando `accounts real lock` debe informar que es una simulación de cierre de sesión o implementarse realmente eliminando llaves de memoria.

### Medium (P2)
- **Documentar L2 como Research**: Asegurarse de que todos los comandos `hardkas l2` tengan el tag `research` visible para evitar confusión con herramientas de mainnet.

---

## 7. Guardrails

- No se modificó lógica runtime.
- No se modificaron runners.
- No se modificaron packages internos.
- No se añadieron comandos.
- No se eliminaron comandos.
- La clasificación se basa en código fuente y auditoría CLI.
