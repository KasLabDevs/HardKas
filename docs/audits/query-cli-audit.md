# HardKas Query CLI Audit

## 1. Scope
Esta auditoría inspecciona la capa de interfaz de línea de comandos (CLI) del Query Engine de HardKas. Se evalúa:
- Cobertura de comandos registrados bajo `hardkas query`.
- Consistencia en el uso del pipeline `QueryRequest` → `execute()` → `serializeQueryResult()`.
- Integración real con los adaptadores y el backend de persistencia (SQLite/FS).
- Calidad y legibilidad de los visualizadores de terminal.
- Gestión de modos de salida (JSON, Explain, Why).
- Riesgos de seguridad y rendimiento desde el punto de vista de la entrada del usuario.

## 2. Executive Summary
El CLI de HardKas Query presenta una arquitectura de comandos muy madura y consistente, siguiendo un patrón estricto de desacoplamiento entre la UI y el motor de ejecución. Sin embargo, se han detectado errores críticos de "ghost code" (referencias a funciones inexistentes) y omisiones en la exposición de capacidades del motor.

**Estado por Dominio:**
- **Artifacts**: **STABLE**. Gran cobertura, aunque falta exponer `verify` en el CLI.
- **Lineage**: **PARTIAL**. Wiring completo, visualización de grafos básica pero efectiva.
- **Replay**: **PARTIAL**. Sistema de divergencias funcional, pero limitado a inspección manual.
- **DAG**: **EXPERIMENTAL**. Modelo ligero claramente señalizado como "not-consensus".
- **Events**: **STABLE**. Filtrado determinista sobre logs persistentes.
- **TX Aggregation**: **STABLE**. La joya de la corona de la introspección operativa.

| Factor | Status | Notes |
| :--- | :--- | :--- |
| Command Coverage | **PARTIAL** | Falta `artifacts verify` y `store sync`. |
| Wiring Consistency | **GOOD** | Uso uniforme de `createQueryRequest` y `execute`. |
| Error Handling | **WEAK** | Presencia de bugs de referencia en visualizadores de diagnósticos. |
| User Experience | **GOOD** | Feedback visual rico y señalización de madurez (stable/preview/research). |

## 3. Query Command Inventory

| Command | Status | Maturity Tag | Wiring |
| :--- | :--- | :--- | :--- |
| `query artifacts list` | **STABLE** | stable | FULL |
| `query artifacts inspect` | **STABLE** | stable | FULL |
| `query artifacts diff` | **STABLE** | stable | FULL |
| `query lineage chain` | **PARTIAL** | preview | FULL |
| `query lineage transitions`| **PARTIAL** | preview | FULL |
| `query lineage orphans` | **PARTIAL** | preview | FULL |
| `query replay list` | **PARTIAL** | preview | FULL |
| `query replay summary` | **PARTIAL** | preview | FULL |
| `query replay divergences` | **EXPERIMENTAL** | preview | FULL |
| `query dag conflicts` | **EXPERIMENTAL** | research | FULL |
| `query dag history` | **EXPERIMENTAL** | research | FULL |
| `query events` | **STABLE** | stable | FULL |
| `query tx <id>` | **STABLE** | stable | FULL |
| `query store doctor` | **STABLE** | alpha | FULL |
| `query store rebuild` | **STABLE** | alpha | FULL |

## 4. CLI Wiring
El wiring sigue un patrón de inyección de dependencias diferido mediante `getQueryEngine()`.

- **Factory Pattern**: `getQueryEngine` (línea 863) intenta conectar con SQLite y realiza un `indexer.sync()` automático. Si falla, cae al `FilesystemQueryBackend`.
- **Request Builder**: Uso sistemático de `createQueryRequest` de `@hardkas/query`.
- **Execution**: Llamadas asíncronas a `engine.execute(request)`.
- **Output selection**: Bifurcación clara entre `serializeQueryResult(result)` (JSON) y funciones de impresión específicas (`printX`).

## 5. Artifacts Query Audit
- **Findings**: El comando `list` soporta una amplia gama de filtros (`--schema`, `--network`, `--mode`, etc.).
- **Missing**: El adaptador soporta la operación `verify` (integridad + semántica), pero el CLI no la expone.
- **Explain Gap**: A diferencia de otros dominios, `artifacts` no soporta el shorthand `--why`.

## 6. Lineage Query Audit
- **Findings**: Excelente soporte para navegación de grafos (`chain` con `--direction`).
- **Orphans**: Muy útil para detectar desincronizaciones en el filesystem.
- **Visualization**: El visualizador `printLineageChain` usa caracteres ASCII para representar la jerarquía.

## 7. Replay Query Audit
- **Findings**: Integra recibos (`receipts`) y trazas (`traces`).
- **Divergences**: Detecta discrepancias de estado. 
- **Wiring**: Correctamente conectado con el adaptador de replay.

## 8. DAG Query Audit
- **Warning Compliance**: Todos los comandos DAG imprimen correctamente el aviso: `⚠ DAG model: deterministic-light-model (NOT GHOSTDAG)`.
- **Operations**: Cobertura total de las capacidades del simulador (conflicts, displaced, sink-path, anomalies).

## 9. Events Query Audit
- **Findings**: Filtrado flexible por dominio, tipo y workflow.
- **Consistency**: Usa el mismo motor de renderizado que el resto de listas.

## 10. TX Aggregation Audit
- **Findings**: Agrega artefactos y eventos bajo una misma vista causal.
- **Integrity**: El campo `complete` permite saber si el ciclo de vida (plan -> signed -> receipt) está cerrado.

## 11. Output Modes
- **--json**: Implementado en todos los comandos usando `serializeQueryResult`. Determinado y consistente.
- **--explain**: Expone metadatos de ejecución (backend, tiempo, filas leídas).
- **--why**: Shorthand para `--explain full`, inyecta el `WhyBlock` (análisis causal).

## 12. Backend / Store Integration
- **Auto-Sync**: Un acierto arquitectónico. `getQueryEngine` sincroniza el Store SQLite en cada consulta, manteniendo la "frescura" sin intervención del usuario.
- **Fallback**: Si la base de datos está corrupta o bloqueada, el CLI retrocede graciosamente a escaneos de filesystem.

## 13. Performance Review
- **Bottleneck**: Los adaptadores están filtrando en memoria tras solicitar todos los datos al backend. Para miles de artefactos, el CLI experimentará latencia significativa.
- **Index Usage**: El CLI reporta `indexesUsed` en el bloque de `explain`, pero actualmente es información declarativa más que diagnóstica real del motor SQL.

## 14. Security Review
- **Path Traversal**: Las rutas de artefactos se limpian y validan antes de la lectura.
- **SQL Injection**: No hay exposición de SQL crudo al usuario. Todos los parámetros viajan vía `QueryRequest` y son saneados por el backend.
- **Secret Leakage**: El bloque `explain` y el volcado JSON podrían filtrar paths absolutos del sistema del desarrollador (`filePath`).

## 15. Findings

### CRITICAL: Ghost Code / Runtime Error
En las funciones `printTxAggregate` (línea 857) y `printDagAnomalies` (línea 777), se llama a `printExplainChains(result.explain)`. Esta función **NO EXISTE** en el archivo. La función correcta es `printExplain`. 
> [!CAUTION]
> Ejecutar estos comandos con `--explain` provocará un crash del CLI (`ReferenceError: printExplainChains is not defined`).

### MISSING: Store Index/Sync
El comando `doctor` sugiere ejecutar `hardkas query store index` para poblar la DB, pero dicho comando no está registrado en `storeCmd`. Solo existen `doctor` y `rebuild`.

### INCONSISTENCY: Artifacts --why
El subcomando `artifacts` es el único que no ha adoptado el shorthand `--why`, requiriendo `--explain full`.

## 16. Recommendations

### P0 — Fix Reference Errors
- Corregir las llamadas a `printExplainChains` por `printExplain` para evitar crashes en producción.

### P1 — UI Consistency
- Añadir el subcomando `artifacts verify` al CLI.
- Añadir el shorthand `--why` al comando `artifacts`.
- Registrar `query store sync` como alias de un proceso de sincronización manual.

### P2 — Performance Hardening
- Implementar "Push-down filtering": pasar los filtros del CLI al backend SQLite para evitar transferencias masivas de datos entre procesos.

## 17. Tests Recommended
- **CLI Integration Test**: Ejecutar cada subcomando con `--explain` para asegurar que no hay más referencias huérfanas.
- **JSON Consistency Test**: Validar que la salida de `--json` es idéntica ejecutando la consulta contra el backend SQLite y el filesystem fallback.
- **Path Escape Test**: Intentar acceder a archivos fuera de `.hardkas` mediante `inspect`.

## 18. Final Assessment
El CLI es **ROBUSTO** en su concepción pero **FRAGMENTADO** en su pulido final. La arquitectura de "QueryEngine as a Service" es brillante y facilita la extensibilidad, pero los errores de referencia en los visualizadores y la falta de algunos comandos clave indican que la integración final fue apresurada. Una vez corregidos los errores de referencia (P0), el sistema estará listo para un uso intensivo por desarrolladores.

## 19. Checklist
- [x] artifacts list auditaodo
- [x] artifacts inspect auditado
- [x] lineage chain auditado
- [x] replay divergences auditado
- [x] dag conflicts auditado
- [x] events auditado
- [x] tx aggregation auditado
- [x] No se modificó lógica runtime.
- [x] No se modificaron comandos CLI.

## 20. Guardrails
- No se modificó lógica runtime.
- No se modificó QueryStore.
- No se modificó QueryEngine.
- No se modificaron schemas.
- Esta auditoría es puramente documental y técnica.
