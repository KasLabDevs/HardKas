# HardKas L2 / Igra Module Audit

## 1. Scope
Esta auditoría evalúa el módulo L2 de HardKas expuesto a través de la interfaz de línea de comandos `hardkas l2 ...`. Se ha analizado:
- La cobertura y el cableado del CLI.
- La gestión de perfiles de red L2 y su integración con la configuración.
- El ciclo de vida transaccional EVM (build, sign, send, receipt, status).
- El soporte para despliegue de contratos inteligentes (deploy-plan).
- El modelo de asunciones de seguridad del bridge (bridge status / assumptions).
- Herramientas auxiliares: balance, nonce y RPC health.
- La estricta separación arquitectónica entre Kaspa L1 (UTXO/DAG) e Igra L2 (EVM Based Rollup).

## 2. Executive Summary
El módulo L2 presenta un conjunto comprensivo de comandos transaccionales y de introspección EVM que honra excepcionalmente bien la arquitectura de red dual. Aclara explícitamente en todas las interacciones que **Kaspa L1 no ejecuta EVM** y que Igra es una capa de ejecución L2.

Sin embargo, el módulo se siente en una etapa experimental (Developer Preview) debido a la **desconexión de perfiles de usuario** (ignora `hardkas.config.ts`) y la limitación de despliegues de contratos (no predice direcciones). 

**Clasificación del sistema:**
- **L2 command coverage:** GOOD (Amplia gama de utilidades).
- **Igra profile model:** PARTIAL (Modelo sólido, pero solo lee built-ins).
- **L1/L2 separation:** GOOD (Advertencias y schemas completamente aislados).
- **Tx pipeline:** EXPERIMENTAL (Fuerte dependencia en RPC; requiere `viem`).
- **Contract deploy-plan:** PARTIAL (Permite empaquetar bytecode pero no predice la dirección final).
- **Bridge assumptions:** GOOD (Modelo maduro pre-zk/mpc/zk).
- **Config integration:** MISSING (Las redes L2 definidas en el config del usuario son ignoradas).
- **Dev usability:** NEEDS HARDENING (Hay mensajes obsoletos de "next steps" que confunden al usuario).

## 3. L2 Command Inventory

| Command | Args | Flags | Runner | Status | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `networks` | - | `--json` | `runL2Networks` | ACTIVE | Solo lista los built-in profiles. |
| `profile show` | `<name>` | `--json` | `runL2ProfileShow` | ACTIVE | Muestra la config del perfil. |
| `profile validate` | `<name>` | `--json` | `runL2ProfileValidate` | ACTIVE | Valida invariantes del perfil. |
| `tx build` | - | `--network`, `--url`, `--from`, `--to`, `--value`, `--data`, `--json` | `runL2TxBuild` | ACTIVE | Hace estimación de gas vía RPC. |
| `tx sign` | `<planPath>`| `--account`, `--json` | `runL2TxSign` | ACTIVE | Falla limpiamente si falta `viem`. |
| `tx send` | `<signedPath>`| `--yes`, `--json` | `runL2TxSend` | ACTIVE | Falla en mainnet (guardrail). |
| `tx receipt` | `<txHash>` | `--network`, `--url`, `--json` | `runL2TxReceipt` | ACTIVE | Combina artifact local + RPC remote. |
| `tx status` | `<txHash>` | `--network`, `--url`, `--json` | `runL2TxStatus` | ACTIVE | Solo consulta RPC. |
| `contract deploy-plan` | - | `--bytecode`, `--constructor`, `--args`, `--json` | `runL2ContractDeployPlan`| ACTIVE | Crea plan de contrato. |
| `bridge status` | - | `--network`, `--json` | `runL2BridgeStatus` | ACTIVE | Output educacional. |
| `bridge assumptions` | - | `--network`, `--json` | `runL2BridgeAssumptions`| ACTIVE | Output educacional / security. |
| `rpc health` | - | `--network`, `--json` | `runL2RpcHealth` | ACTIVE | Diagnostics. |
| `balance` | `<address>` | `--network`, `--url`, `--json` | `runL2Balance` | ACTIVE | L2 EVM state. |
| `nonce` | `<address>` | `--network`, `--url`, `--json` | `runL2Nonce` | ACTIVE | L2 EVM state. |

## 4. CLI Wiring
- El registro de comandos en `l2.ts` usa un patrón correcto de comandos anidados (`tx`, `contract`, `bridge`).
- Todos soportan `--json`.
- **Riesgo:** Un mensaje obsoleto (stale hint) ocurre después de firmar.

| Area | Behavior | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| Stale Hints | `tx sign` dice "L2 transaction sending is not implemented yet" pero `tx send` sí existe en `l2.ts`. | LOW (Confusión UX) | Actualizar el console.log final de `runL2TxSign` para sugerir usar `hardkas l2 tx send`. |

## 5. Network / Profile Model Audit

Los perfiles (Profiles) son la forma en que HardKas modela la red.

| Feature | Present | Source | Risk | Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| Built-in profiles | SÍ | `profiles.ts` | LOW | Contiene perfil `igra` (pre-zk). |
| User config profiles | NO | `registry.ts` ignora el config | HIGH | Actualizar `listL2Profiles()` para hacer merge de las redes `kind: "igra"` definidas en `hardkas.config.ts`. |
| Execution/Settlement | SÍ | L2 type model | LOW | Arquitectónicamente correcto. |

- El perfil requiere explícitamente definir `executionLayer: "evm"` y `settlementLayer: "kaspa"`.

## 6. L1 / L2 Separation Audit

El módulo es arquitectónicamente impecable en su modelado. Evita crear ambigüedad entre un nodo Kaspa UTXO y un secuenciador Igra.

| Area | Current behavior | Correct architecture | Risk |
| :--- | :--- | :--- | :--- |
| EVM Execution | Módulo y warnings indican que corre en L2 | SÍ | LOW |
| Kaspa L1 | Warnings indican explícitamente "Kaspa L1 does not execute EVM" | SÍ | LOW |
| Artifacts | Usa esquemas únicos (`igraTxPlan`, `igraSignedTx`) | SÍ | LOW |

## 7. L2 Tx Build Audit

| Field / Step | Present | Deterministic | Risk |
| :--- | :--- | :--- | :--- |
| RPC Dependency | Requiere acceso RPC para `nonce` y `gasLimit` | NO | Si el RPC cae, la construcción falla. Podría mejorarse con `--offline`. |
| Output Artifact | Crea `IGRA_TX_PLAN` (`planId` determinista) | SÍ | Genera `.igra.plan.json` que previene confusiones con UTXO. |

## 8. L2 Tx Sign Audit

| Feature | Present | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| Signer Backend | Usa `viem` | LOW | Buena validación si `viem` no está instalado en el proyecto del usuario. |
| Account Address Guard | SÍ | LOW | Si el address del plan y la privateKey no coinciden, aborta la ejecución. |
| Output Artifact | `IGRA_SIGNED_TX` | LOW | Documentación precisa. |

## 9. L2 Tx Send / Receipt / Status Audit

| Command | RPC call | Output | Risk |
| :--- | :--- | :--- | :--- |
| `send` | `eth_sendRawTransaction` | Crea artefacto de recibo | Protegido. Reclama `--yes` y rechaza broadcast si `network === "mainnet"`. Verifica que el `chainId` del artefacto concuerde con el del RPC endpoint actual antes de enviar. ¡Excelente práctica de seguridad contra re-plays cruzados! |

## 10. Contract Deploy-Plan Audit

El comando permite empaquetar el bytecode, pero está limitado.

| Feature | Present | Status | Risk |
| :--- | :--- | :--- | :--- |
| Bytecode + Constructor | SÍ | Funcional | LOW |
| CREATE Address Prediction | NO | EXPERIMENTAL | Genera el plan, pero el CLI no muestra la dirección de contrato esperada (ya sea vía CREATE manual usando el sender nonce, o vía CREATE2 salt). |
| Broadcast | NO | Funcional | `deploy-plan` respeta el patrón y solo emite un plan. |

## 11. Bridge Status / Assumptions Audit

El modelo de fases (Phases) del puente Igra (pre-zk -> MPC -> ZK) está matemáticamente encapsulado en el CLI.

| Bridge aspect | Current behavior | Correct model | Risk |
| :--- | :--- | :--- | :--- |
| Phase Modeling | Clasifica en `pre-zk`, `mpc`, `zk`. | SÍ | LOW |
| Trustless Exit Guard | Solo permite `trustlessExit: true` en fase `zk`. Si un perfil MPC intenta reclamarlo, `validateL2Profile` estalla con error. | SÍ | LOW |
| Documentation | Informa "pre-ZK implies stronger trust assumptions". | SÍ | LOW |

El comando `bridge assumptions` NO sobrepromete, advirtiendo de forma clara que un bridge basado en threshold de firmas en pre-zk no es trustless exit.

## 12. Balance / Nonce Audit

| Command | RPC method | Unit semantics | Risk |
| :--- | :--- | :--- | :--- |
| Balance | `eth_getBalance` | Muestra `wei` y convierte a formato base usando `nativeTokenDecimals`. | LOW |
| Nonce | `eth_getTransactionCount` | Pide explícitamente block `latest` o `pending`. | LOW |

## 13. RPC Health Audit
Registrado correctamente, útil para testing.

## 14. Artifact Integration

Los artefactos están correctamente diferenciados. Todos usan el prefijo `igra` en el archivo para evitar que el `QueryEngine` L1 los mezcle accidentalmente sin filtro.

| Artifact | Produced by | Contains temporal metadata | Deterministic | Risk |
| :--- | :--- | :--- | :--- | :--- |
| `igraTxPlan` | `tx build` / `deploy-plan` | SÍ (`createdAt`) | Parcial | Mismo riesgo documentado en `artifact-engine-audit`. |

## 15. Config Integration

Esta es la mayor deficiencia del módulo L2 en este momento.

| Config feature | Current status | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| User profiles | Ignorados | HIGH | El usuario puede poner `networks: { myL2: { kind: "igra" } }` en `hardkas.config.ts`, pero el `registry.ts` (L13) devuelve hardcodeado `BUILTIN_L2_PROFILES`. |

## 16. Security / Safety Review
- **Malicious RPC Guard:** El comando `tx send` comprueba `remoteChainId !== artifact.chainId` antes de emitir, bloqueando ataques de replay de redes si el usuario apuntó a un RPC falso.
- **Mainnet Guard:** Broadcast a mainnet está deshabilitado en hardcode (`isMainnet` bloquea la ejecución).
- **Bridge Reality:** El rigor en la representación criptoeconómica (bloquear claims de trustless exit en pre-zk) asegura que Kaspa/Igra evite la "falsa publicidad" que otras herramientas blockchain sufren.

## 17. Documentation / UX Review
- **Stale Hint:** El comando de firmas reporta que el envío no está implementado a pesar de que el flag `tx send` sí lo está.
- L1 vs L2 se documenta de maravilla en las notas finales de comando.

## 18. Findings

### GOOD
- **Representación Arquitectónica Correcta:** No hay rastro de afirmar falsamente que Kaspa L1 ejecuta EVM o que un L2 incipiente es trustless por defecto.
- **Validación Estricta:** Validar el `chainId` en el envío es una mitigación excelente para ataques comunes de replay inter-cadenas L2.

### NEEDS HARDENING
- **Integración de Configuración (Wiring):** El `registry.ts` necesita parsear urgentemente el `hardkas.config.ts`.
- **Despliegue Ciego:** Desplegar contratos sin ver la dirección predictiva limita a los devs.

## 19. Recommendations

### P0 — Architecture correctness
- Mantener la línea actual; el modelado pre-ZK/MPC/ZK es el estándar oro en auditoría de rollups/L2s.

### P1 — Dev usability
- Cerrar el Wiring Gap actualizando `packages/l2/src/registry.ts:listL2Profiles()` para leer la configuración del usuario.
- Eliminar el Stale Hint en `runL2TxSign` y reemplazarlo por instrucciones para correr `hardkas l2 tx send <path> --yes`.

### P2 — Artifact hardening
- Alinear el determinismo como se describió en la auditoría principal de artefactos.

### P3 — Advanced features
- Añadir un pre-cálculo de dirección en `deploy-plan` usando RLP encoding `rlp([sender_address, sender_nonce])` (CREATE1 prediction) o `CREATE2` salts.

## 20. Proposed L2 Module v1
El diseño de `profiles.ts` ya es v1-ready. Una vez que se consuma el `config` del usuario, un perfil L2 ideal se verá así en el framework:

```ts
// hardkas.config.ts
export default {
  networks: {
    igraDevnet: {
      kind: "igra",
      executionLayer: "evm",
      settlementLayer: "kaspa",
      chainId: 19416,
      rpcUrl: process.env.IGRA_RPC_URL,
      security: {
        bridgePhase: "pre-zk",
        trustlessExit: false
      }
    }
  }
}
```

## 21. Tests Recommended
- `l2 network overrides`: test que verifique que el dev config sobreescribe o añade perfiles `igra`.
- `chainId mismatch rejection`: intentar enviar un plan firmado de la red A mediante un RPC de la red B.
- `bridge invariant enforcement`: inyectar `trustlessExit: true` en fase `mpc` y verificar que el config loader lo tire.
- `deploy plan prediction`: garantizar que la dirección inferida es reportada por el comando.

## 22. Final Assessment
**¿Qué tan usable es el módulo L2 hoy?**
Es extremadamente usable para la capa transaccional básica EVM, siempre y cuando se utilicen las redes hardcodeadas built-in o se pase el RPC vía flag en cada invocación.

**¿Qué es experimental?**
El flujo de usuario completo está desconectado del configuration file.

**¿Representa correctamente Igra y diferencia L1/L2?**
De manera sobresaliente. Se esfuerza activamente en no crear confusión conceptual, aplicando barreras duras entre un `TxPlan` UTXO y un `IgraTxPlan` EVM.

## 23. Checklist
- [x] networks
- [x] profile show
- [x] tx build
- [x] contract deploy-plan
- [x] bridge assumptions
- [x] balance
- [x] nonce
- [x] No modificar lógica runtime
- [x] No modificar L2 package
- [x] No modificar commands
- [x] Auditoría documental únicamente

### Guardrails
- No se modificó lógica runtime.
- No se modificó módulo L2.
- No se modificaron runners.
- No se modificaron comandos.
- Esta auditoría es puramente documental e inspecciona las validaciones actuales de la arquitectura Igra L2 y Kaspa L1 en el Tooling de HardKas.
