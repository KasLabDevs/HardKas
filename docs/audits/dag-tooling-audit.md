# HardKas DAG Tooling Audit

## 1. Scope
Esta auditoría evalúa el **DAG simulator** y las herramientas relacionadas en HardKas (incluyendo los comandos `query dag ...` y el modelo de estado local en `packages/localnet`). El enfoque incluye:
- El modelo determinista del DAG local.
- Lógica de simulación de reorgs, path al sink y desplazamientos (displacement).
- Detección de conflictos de doble gasto (double-spend) y anomalías.
- Interacción entre el motor de Replay y el DAG.
- Precisión y relación del modelo de HardKas frente a los conceptos de consenso reales de Kaspa (GHOSTDAG / DAGKnight).

## 2. Executive Summary
El "DAG Tooling" de HardKas **NO ES UN SIMULADOR DE CONSENSO KASPA REAL. NO ES GHOSTDAG, NI DAGKNIGHT, NI SPECTRE.** 

Se trata de un **modelo determinista ligero (deterministic-light-model)** diseñado puramente para **developer debugging, visualización de conflictos y testing de replay**. Su propósito es enseñar a los desarrolladores los *conceptos* de reorgs y desplazamientos de forma predecible en CI/CD, pero utiliza heurísticas extremadamente simples (como tomar el primer padre) en lugar de la matemática real de conjuntos de mezcla (merge sets) de PHANTOM/GHOSTDAG.

**Clasificación del sistema:**
- DAG tooling maturity: **EXPERIMENTAL / RESEARCH**
- Consensus accuracy: **WEAK** (Intencionalmente heurístico)
- Deterministic replay support: **GOOD**
- Conflict analysis: **GOOD** (Basado en UTXOs)
- Reorg simulation: **PARTIAL** (Simulación manual orientada a tests)
- Research maturity: **GOOD** (Provee introspección profunda)

## 3. DAG Command Inventory

| Command | Purpose | Source | Maturity | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `query dag conflicts` | Muestra ganadores y perdedores de un doble gasto | `query/dag-adapter.ts` | RESEARCH | Basado en el `conflictSet` del DAG local |
| `query dag displaced` | Lista txs que perdieron su lugar en el consenso | `query/dag-adapter.ts` | RESEARCH | Compara sets aceptados vs desplazados |
| `query dag history` | Historial de una Tx en el DAG | `query/dag-adapter.ts` | RESEARCH | Escanea bloques para trazar el ciclo de vida |
| `query dag sink-path` | Recorrido desde el sink hasta el genesis | `query/dag-adapter.ts` | RESEARCH | Heurística simple de parents[0] |
| `query dag anomalies` | Detecta violaciones de invariantes lógicos | `query/dag-adapter.ts` | RESEARCH | Verifica txs huerfanas o bloques inalcanzables |
| `dag status` | Muestra estado del DAG local | `dag-runners.ts` | PARTIAL | - |
| `dag simulate-reorg`| Crea un fork artificial y mueve el sink | `dag-runners.ts` | PARTIAL | Solo localnet |

## 4. DAG Model Architecture

| DAG Area | Current behavior | Risk | Notes |
| :--- | :--- | :--- | :--- |
| Representación de Nodos | `SimBlock` con `id`, `parents[]`, `daaScore` y `acceptedTxIds`. | LOW | Estructura simplificada persistida en JSON |
| Representación de Edges | Cadenas de IDs de bloques padres. | LOW | DAG básico |
| Selected Parent | Siempre asume `parents[0]`. | HIGH | Altamente heurístico. No usa blue work. |
| Persistencia | Persistido en `state.json` (`localnet/state.ts`) | LOW | Ideal para testing determinista |

## 5. Reorg Simulation Audit

| Feature | Present | Deterministic | Accuracy | Risk |
| :--- | :--- | :--- | :--- | :--- |
| Detección de desplazamientos | SÍ | SÍ | Heurística | LOW |
| Disparador de reorg | SÍ (vía comando manual) | SÍ | Baja | LOW |
| Evaluación de conjuntos | NO | N/A | Falla | HIGH |

El comando `simulate-reorg` crea un bloque lateral (side-block) y ejecuta la función `moveSink()`. La lógica entonces re-calcula las transacciones aceptadas iterando en orden topológico desde el nuevo sink hacia atrás. **Es determinista pero no exacto cripto-económicamente**.

## 6. Sink Path Logic Audit

| Area | Implementation | Deterministic | GHOSTDAG accuracy | Notes |
| :--- | :--- | :--- | :--- | :--- |
| Definición de Sink | Puntero manual en el estado (`dag.sink`) | SÍ | Pobre | En Kaspa el virtual sink se calcula por consenso |
| Cálculo de Sink Path | `calculateSelectedPath` itera usando `parents[0]` | SÍ | Pobre | No implementa K-clusters ni coloración blue/red |
| Estabilidad topológica | SÍ. Usa `daaScore` + Lexicográfico | SÍ | Media | Asegura ordenación reproducible en tests |

## 7. Displacement Logic Audit

| Displacement feature | Present | Model | Risk |
| :--- | :--- | :--- | :--- |
| Transacciones desplazadas | SÍ | Arrays `acceptedTxIds` vs `displacedTxIds` | LOW |
| Resolución de conflictos | SÍ | Prioridad: 1) sink-path, 2) daaScore, 3) txId lexicográfico | LOW |
| Impacto en replay | SÍ | `correlate.ts` advierte cuando una Tx en el plan fue desplazada | LOW |

## 8. Conflict Model Audit

El análisis de conflictos (Double-spend) es puramente local y se fundamenta en los UTXOs.

| Conflict type | Supported | Accuracy | Deterministic | Notes |
| :--- | :--- | :--- | :--- | :--- |
| UTXO Double-spend | SÍ | Alta | SÍ | Si dos txs usan la misma outpoint, una pierde |
| Paralelismo sin conflicto| SÍ | Alta | SÍ | Ambas txs entran en el bloque |
| Conflicto de ordenación| SÍ | Media| SÍ | Depende del lexicográfico en empates de daaScore |

## 9. Anomaly Detection Audit

Las anomalías se calculan en `executeAnomalies` escaneando invariantes del simulador:

| Anomaly | Detection | Deterministic | Reliability |
| :--- | :--- | :--- | :--- |
| `displaced-never-reaccepted` | Txs perdidas para siempre | SÍ | Alta (en el marco local) |
| `unreachable-block` | Nodos desconectados del sink | SÍ | Alta |
| `invariant-violation` | Tx en ambos arrays a la vez | SÍ | Alta |

## 10. Replay Integration Audit

| Replay feature | DAG integration | Risk |
| :--- | :--- | :--- |
| Inyección de Contexto | `applySimulatedPayment` incrusta `dagContext` en el `txReceipt` | LOW |
| Cross-domain Correlate| `correlate.ts` enlaza Lineage + DAG status + Replay Invariants | LOW |

La integración es pasiva: el Replay lee el estado del DAG local y anota en su recibo qué modo existía en ese momento.

## 11. Determinism Review

**¿Mismos artefactos + mismo replay = mismo DAG analysis?**  
👉 **YES.**

El simulador ha sido endurecido matemáticamente para el determinismo de tests:
1. Las transacciones generan hashes idénticos (`generateDeterministicTxId`) dados el mismo plan y `daaScore`.
2. `resolveConflictsDeterministically` desempata siempre usando el orden lexicográfico del `txId`.
3. No hay dependencia temporal en el ensamblado de los grafos.

## 12. Consensus Accuracy Review

Comparativa estricta con el protocolo Kaspa real:

| Consensus Feature | HardKas DAG Tooling | Real Kaspa Consensus |
| :--- | :--- | :--- |
| **Blue Score / Red Score** | NO (Solo un contador incremental base) | SÍ (Basado en K-clusters y merge sets) |
| **Selected Parent** | Heurística ingenua (`parents[0]`) | Cálculo GHOSTDAG ponderado por peso de red |
| **Merge Sets** | NO | Central para la resolución de orden |
| **Determinismo** | SÍ (Absoluto para testing offline) | SÍ (Eventual / Estocástico por red) |

## 13. Performance Review
- **Complejidad:** El traversal topológico asume BFS en memoria (`identifyReachableBlocks`).
- **Escala:** Es óptimo para los cientos de bloques de un test local, pero colapsaría bajo memoria O(N) para tamaños de mainnet. Esto es intencional y correcto para un "Localnet tooling".

## 14. Findings

### GOOD
- **Determinismo Estricto:** Es una herramienta excelente para CI/CD y testing de resiliencia de wallets ante reorgs forzados.
- **Transparencia en el Tooling:** El comando `correlate` ofrece una vista impresionante de 360 grados uniendo DAG, Lineage y Replays.
- **Análisis de UTXO:** La resolución de conflictos de doble gasto está implementada de manera robusta a nivel semántico.

### NEEDS HARDENING
- **Ambigüedad en la Terminología:** El CLI expone comandos "DAG" de forma destacada, lo que podría confundir a un desarrollador novato creyendo que HardKas verifica el consenso criptográfico de Kaspa.
- **Falta de Merge Sets Reales:** Al no calcular merge-sets, la simulación de reorgs no ilustra la belleza de la confirmación paralela de GHOSTDAG, comportándose más como un blockchain lineal con side-branches tontos.

## 15. Recommendations

### P0 — Clarify Research Status
- Añadir banners (como el actual `DAG_MODEL_WARNING`) no solo a los queries, sino a la documentación principal. Marcar explícitamente como `LIGHT-MODEL / NOT CONSENSUS`.

### P1 — Deterministic DAG Core
- Formalizar las reglas de `resolveConflictsDeterministically` en la documentación para que los desarrolladores entiendan cómo desempata (sink-path > daaScore > txId).

### P2 — Better Replay Integration
- Guardar *Snapshots del DAG* (no solo el string `dagContext`) adjuntos a los replays fallidos para poder inspeccionar el grafo exacto en el momento de una divergencia.

### P3 — Advanced Research
- Implementar una aproximación matemática ligera pero real a los **Merge Sets** para que `displaced` se comporte de forma más educativa sobre el algoritmo SPECTRE/PHANTOM.

## 16. Proposed DAG Tooling v1
El objetivo en v1 es no pretender ser un nodo Kaspa.
- El CLI debería presentar estos comandos agrupados bajo `hardkas query local-dag` o mantener el tag `[RESEARCH: LIGHT-MODEL]` de forma ultra visible.
- Re-diseñar el `SimBlock` para incluir un campo `mergeSet: string[]` simulado, mejorando la comprensión visual del desarrollador.

## 17. Tests Recommended
- `deterministic sink path`: test de invariante lexicográfico.
- `displaced tx detection`: forzar reorg de profundidad N y validar arrays.
- `double-spend conflict`: validar que el txId ganador coincide con la especificación lexicográfica.
- `same artifacts => same DAG analysis`: Integración CI/CD.
- `lineage+DAG consistency`: Correlacionar un artifact padre-hijo bajo reorg.

## 18. Final Assessment
**¿Qué es realmente el DAG tooling hoy?**
Es un emulador determinista de reorgs y doble-gastos para desarrolladores que escriben pipelines de transacciones (planners). 

**¿Qué NO es?**
No es un validador de bloques, ni una implementación del paper de GHOSTDAG, ni sirve para evaluar ataques reales del protocolo Kaspa. Sirve maravillosamente como herramienta de *mocking* complejo para aplicaciones que necesitan probar su tolerancia a fallos lógicos en la red sin depender de un Kaspa Testnet node.

## 19. Checklist
- [x] Reorg simulation
- [x] Sink path logic
- [x] Displacement logic
- [x] Conflict model
- [x] Anomaly detection
- [x] No modificar lógica runtime
- [x] No modificar DAG engine
- [x] No modificar query engine
- [x] Auditoría documental únicamente

## Guardrails
- No se modificó lógica runtime.
- No se modificó DAG tooling.
- No se modificó QueryEngine.
- No se modificó Localnet.
- Esta auditoría es puramente documental, analizando la precisión frente a los papers y su implementación actual en el código.
