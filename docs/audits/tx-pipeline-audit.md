# HardKas Transaction Pipeline Audit (tx plan)

## 1. Scope
Esta auditoría analiza el pipeline de planificación de transacciones de HardKas, centrado en el comando `hardkas tx plan` y el paquete `@hardkas/tx-builder`. Se evalúan los procesos de:
- Resolución de cuentas y redes.
- Obtención y selección de UTXOs.
- Cálculo de masa y comisiones (fees).
- Generación de artefactos `txPlan`.
- Determinismo y reproducibilidad del pipeline.

## 2. Executive Summary
El pipeline de `tx plan` implementa una arquitectura desacoplada y basada en artefactos, lo cual es excelente para auditoría y workflows de CI/CD. La lógica de cálculo de masa es consciente del protocolo (P2PK/Schnorr), y la selección de monedas sigue una estrategia de acumulación simple. El objetivo central de HardKas no es ser un motor de billetera comercial, sino un **"developer-safe deterministic planner"**. Sin embargo, el sistema presenta debilidades en la **reproducibilidad determinista** (falta ordenamiento canónico en empates), lo que impacta directamente la estabilidad de los hashes de los artefactos.

**Estado General: SOLID ARCHITECTURE / NEEDS DETERMINISTIC HARDENING**

## 3. Pipeline Flow
El flujo de ejecución observado es:
`runTxPlan()` 
  → `resolveHardkasAccountAddress` (Resolución de emisor/receptor)
  → `RPC: getUtxosByAddress` (Obtención de balance real)
  → `buildPaymentPlan` (Selección de UTXOs y cálculo de masa)
  → `createTxPlanArtifact` (Generación de JSON firmado por hash)

## 4. Fee Rate Review
- **Configurabilidad**: Soportado vía CLI y config.
- **Dinámica**: **NO**. El fee-rate es estático; no consulta el estado de congestión de la red (mempool).
- **Cálculo**: `masa * feeRate`. Correcto según el protocolo Kaspa.
- **Riesgo**: En Mainnet, un fee-rate estático desactualizado puede causar transacciones atascadas o sobrepagos innecesarios.

## 5. Mass Calculation Review
- **Implementación**: Localizada en `@hardkas/tx-builder/mass.ts`.
- **Precisión**: Utiliza constantes para P2PK/Schnorr (Base: 100, Input: 150, Output: 50).
- **Asunciones**: Documenta explícitamente que asume firmas Schnorr.
- **Riesgo**: `estimated mass != final signed mass`. Si la firma real excede la predicción por variaciones de tamaño de DER (aunque Schnorr es fijo, el script de firma podría variar), la transacción podría ser rechazada por comisión insuficiente.

## 6. UTXO Selection Review
- **Estrategia**: **Smallest-First Accumulation**. Ordena los UTXOs de menor a mayor cantidad y acumula hasta cubrir el objetivo + fee.
- **Optimización**: No existe lógica de consolidación ni de minimización de masa.
- **Fragmentación**: Esta estrategia tiende a limpiar "dust" (pequeños UTXOs) pero puede generar transacciones con muchos inputs si el balance está muy fragmentado, aumentando la comisión total.

## 7. Output Construction Review
- **Cambio (Change)**: Implementado correctamente. Se genera un output de cambio si sobra cantidad tras restar el pago y la comisión.
- **Dust Limit**: No se observa una política explícita de "dust avoidance" para el output de cambio. Si el cambio es minúsculo, debería quemarse como fee adicional en lugar de crear un UTXO económicamente inútil.

## 8. Deterministic Ordering Audit
**Hallazgo Crítico: REPRODUCIBILIDAD DÉBIL**
- **Inputs**: `buildPaymentPlan` ordena los UTXOs por `amountSompi` (ascendente).
- **Tie-breaking**: Si hay múltiples UTXOs con la misma cantidad, el orden depende del array devuelto por el RPC. El RPC no garantiza orden determinista.
- **Outputs**: Se mantienen en el orden de entrada; no hay ordenamiento canónico (BIP69-style).

**Riesgo**: Dos llamadas idénticas a `tx plan` pueden producir dos artefactos con diferentes `planId` (hashes) si el RPC altera el orden de los UTXOs con montos idénticos.

## 9. Artifact Integrity
- **Schemas**: Tipados y versionados correctamente (`hardkas.txPlan`).
- **BigInt**: Manejado correctamente mediante strings en JSON para evitar pérdida de precisión.
- **Auditoría**: El artefacto contiene toda la información necesaria para el signing (`inputs`, `outputs`, `amount`, `network`).

## 10. Side Effects Audit
- **Pipeline**: Es puramente de lectura y cálculo local. 
- **Broadcast**: No ocurre en esta fase.
- **Seguridad**: No requiere claves privadas para esta fase.

## 11. Determinism Risk Matrix

| Area | Deterministic | Notes |
| :--- | :--- | :--- |
| Fee formula | YES | Fórmula pura. |
| Artifact schema | YES | Estable y tipado. |
| UTXO retrieval | **NO** | Depende del orden de respuesta del RPC. |
| Coin selection | **PARTIAL** | Falta tie-breaking canónico (ej. por txid:index). |
| Output ordering | **NO** | No hay sorting canónico. |
| Final hash | **PARTIAL** | Inestable ante cambios de orden de inputs iguales. |

## 12. Architectural Findings

### GOOD
- **Desacoplamiento**: La separación `plan -> sign -> send` es impecable.
- **Transparencia**: El cálculo de masa desglosado permite depurar problemas de fees.

### WEAKNESSES
- **Reproducibilidad**: Inconsistencias potenciales en hashes de artefactos.
- **Optimización**: Estrategia de selección básica.
- **Dust Policy**: Falta de protección contra creación de micro-UTXOs.

## 13. Recommended Stability Classification
- **tx plan architecture**: SOLID
- **fee calculation**: GOOD
- **mass estimation**: GOOD FOR DEV / PARTIAL FOR STRICT FINALITY
- **UTXO selection**: BASIC BUT ACCEPTABLE
- **deterministic reproducibility**: **NEEDS HARDENING** (Impacts Artifacts)
- **wallet optimization**: OUT OF SCOPE FOR NOW

## 14. Recommendations

### P0 — Reproducibilidad (Prioridad Máxima)
- **Tie-break Determinista**: Implementar un ordenamiento secundario por `txid` (lexicográfico) e `index` (ascendente) para inputs de igual monto. Esto garantiza un `planId` idéntico ante cualquier respuesta del RPC.
- **Estrategia en Artifact**: Persistir explícitamente la `selectionStrategy` usada dentro del artifact para auditoría de reconstrucción.

### P1 — Robustez
- **Dust Threshold**: Formalizar un límite mínimo para crear outputs de cambio para evitar micro-fragmentación inútil.

### P2 — Flexibilidad Dev
- **Selection Strategies**: Implementar modos opcionales (ej. `consolidate`, `minimize-mass`) para facilitar pruebas de límites de masa.

### P3 — Dinamismo
- **Dynamic Fees**: Permitir consulta de fee-rate al RPC (prioridad baja para entornos locales).

## 15. Proposed Pipeline v1 (Endurecido)
1. Resolve Accounts
2. Fetch UTXOs from RPC
3. **Canonical Pre-Sort (txid:index)**
4. Deterministic Coin Selection (Smallest-first + Tie-break)
5. Mass Estimation
6. Fee Calculation
7. Dust Elimination (Merge tiny change into fee)
8. **Canonical Output Sort**
9. Emit Stable txPlan Artifact

## 16. Final Assessment
HardKas `tx plan` es un planificador robusto y muy bien estructurado. Su mayor reto actual no es de optimización financiera, sino de **determinismo técnico** para asegurar que el pipeline de artefactos sea 100% reproducible y confiable en entornos de CI/CD.

## 17. Checklist
- [x] Revisar fee-rate
- [x] Revisar mass calculation
- [x] Revisar UTXO selection
- [x] Revisar outputs
- [x] Revisar deterministic ordering
- [x] No modificar lógica runtime
- [x] No modificar tx-builder
- [x] No modificar runners
- [x] Auditoría documental únicamente

## Guardrails
No se modificó lógica runtime.
No se modificó tx-builder.
No se modificaron runners.
No se modificaron comandos.
Esta auditoría es documental.
