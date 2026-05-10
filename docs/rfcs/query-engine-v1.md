# RFC: HardKas Query Engine v1

## 1. Problem Statement
El sistema de consultas de HardKas sufre actualmente de una **fractura arquitectónica**. Mientras que el CLI tiene una cobertura de comandos aceptable y el `QueryStore` (basado en SQLite) está bien diseñado, ambos mundos están desconectados.
- El **Query Engine** opera mayormente mediante escaneos recursivos del sistema de archivos, lo que degrada el rendimiento a medida que el workspace crece.
- El **Lineage formal** de artefactos existe pero se consume de forma inconsistente entre los diferentes runners.
- Las herramientas de **DAG y Replay** operan como islas aisladas (light-model/research) sin una interfaz de datos común.
- Falta una **API estable** que permita construir una Web UI o herramientas de auditoría externas.
- No existe un **envelope JSON único** que proporcione metadatos de ejecución (Explain/Why) junto con los resultados.

**Mandato Crítico:** El objetivo de Query Engine v1 no es "añadir más comandos", sino consolidar una **capa de introspección coherente** que sirva como columna vertebral de observabilidad para HardKas.

## 2. Goals
- **Store-first Architecture**: Utilizar `QueryStore` (SQLite) como backend primario para todas las consultas.
- **Explain Mode**: Proporcionar transparencia total sobre cómo se resolvió una consulta (índices, filtros, backend).
- **Why Mode (Causalidad)**: Responder a la pregunta de *por qué* un objeto está en cierto estado basándose en evidencias y lineage.
- **DAG Graph API**: Exponer el grafo de simulación DAG mediante una API estructurada (marcada explícitamente como *research model*).
- **Replay Graph**: Unificar el flujo de `txPlan -> signedTx -> receipt -> trace` en un grafo de ejecución consultable.
- **Event Sourcing**: Modelar los cambios de estado como un log de eventos local indexado.
- **Web UI API**: Proveer una interfaz de datos estable (Read-only) para futuras herramientas visuales.
- **Unified JSON Envelope**: Garantizar una estructura de respuesta consistente para CLI y API.

## 3. Non-Goals
- No implementar validación de consenso GHOSTDAG real (HardKas no es un nodo de red).
- No reemplazar las llamadas RPC directas de `kaspad` para estados de red en vivo.
- No ser un block explorer de propósito general para Mainnet.
- No exponer SQL crudo (RAW SQL) como API pública mutable.
- No garantizar seguridad de grado institucional para la custodia de datos de consulta.
- No optimizar para escalas de "Mainnet Indexer" (objetivo: local workstation scale).

## 4. Current State Summary

| Area | Current State | Gap |
| :--- | :--- | :--- |
| **CLI Commands** | Amplia superficie de comandos | Inconsistencia en el backend; mezcla lógica de negocio con escaneo de archivos. |
| **QueryStore** | Esquema SQLite de alta calidad | **Desconectado**; el motor no lo usa para búsquedas calientes. |
| **Artifacts** | Esquemas Zod canónicos | El determinismo de identidad es parcial (afectado por `createdAt`). |
| **Lineage** | Modelo formal de padres/hijos | Muchos runners siguen usando campos legacy como `sourcePlanId`. |
| **DAG** | Modelo ligero de simulación | Necesita una frontera clara entre "simulación de debug" y "realidad de red". |
| **Events** | Sistema de logs básico | Falta un envelope de *Event Sourcing* para reconstruir timelines. |
| **Web UI** | Inexistente | No hay una API estable para que una UI consuma datos de forma eficiente. |

## 5. Architecture Principles
1. **Store-first, scan fallback**: Las consultas siempre intentan usar el índice de SQLite; solo se recurre al disco si el índice está ausente o corrupto.
2. **Explain everything**: Cada respuesta debe poder explicar su procedencia y el costo de ejecución.
3. **Causalidad (Why)**: "Why" significa rastrear el camino causal de eventos y lineage, no solo mostrar texto de debug.
4. **Graphs as first-class**: El linaje, el DAG y el replay se tratan como grafos (nodos y aristas), no solo como listas de archivos.
5. **Stable JSON Envelope**: La estructura de la respuesta es sagrada y debe ser idéntica para el CLI y la API.
6. **Redaction by default**: La capa de consulta debe filtrar secretos antes de cualquier salida.

## 6. Query Engine v1 Architecture

```text
Artifact Files / Events / Localnet State
        ↓
Indexer (Sync Logic)
        ↓
QueryStore SQLite (Persistence)
        ↓
QueryEngine Core (Coordination)
        ↓
Domain Adapters
  [Artifacts] [Lineage] [Replay] [DAG] [Events] [TX 360]
        ↓
Output Adapters
  [CLI Text] [JSON Envelope] [Web UI API]
```

El **Indexer** debe ser un proceso explícito y verificable. El motor de consultas debe informar siempre sobre la "frescura" del índice (Freshness).

## 7. JSON Result Envelope v1
Todas las consultas devolverán una estructura unificada:

```typescript
type QueryResult<T> = {
  ok: boolean;
  apiVersion: "1.0.0";
  query: {
    domain: "artifacts" | "tx" | "dag" | "events";
    op: string;
    filters: Record<string, unknown>;
    mode: "default" | "explain" | "why";
  };
  data: T;
  graph?: QueryGraph; // Opcional, para respuestas con topología
  explain?: ExplainBlock;
  why?: WhyBlock;
  warnings: QueryWarning[];
  diagnostics: {
    backend: "sqlite" | "filesystem-fallback";
    indexFreshness: "fresh" | "stale" | "unknown";
    executionMs: number;
    scannedFiles: number;
    rowsRead: number;
  };
};
```

## 8. Explain Mode
El modo `explain` debe responder:
- ¿Qué backend se utilizó realmente (SQLite vs Disco)?
- ¿Qué filtros se aplicaron a nivel de base de datos?
- ¿Cuántos registros se leyeron y cuántos archivos se escanearon?
- Sugerencias de optimización (ej: "Run 'hardkas query store rebuild' for better performance").

## 9. Why Mode (Causalidad)
Proporciona una cadena de evidencias que explican un estado.
```typescript
type WhyBlock = {
  question: string;
  answer: string;
  evidence: {
    type: "artifact" | "event" | "block" | "code";
    id: string;
    ref: string; // Link al archivo o registro
  }[];
  causalChain: {
    step: string;
    description: string;
    timestamp: string;
  }[];
};
```
*Ejemplo: "¿Por qué este artefacto es huérfano?" -> Answer: "No se encuentra el padre con hash X; la cadena causal muestra un checkout de rama que eliminó el archivo original."*

## 10. Artifact Query v1
- **Discovery**: Búsqueda por `txId`, `contentHash`, `schema` o `network`.
- **Lineage**: Navegación bidireccional (padres y descendientes).
- **Diff**: Comparación estructural entre dos estados de un artefacto.

## 11. Lineage Graph v1
El linaje se expone como un grafo formal:
- **Nodes**: Artefactos.
- **Edges**: Relaciones `parentArtifactId` (formales) o `sourcePlanId` (legacy).
- **Annotations**: Detección de ciclos, huérfanos y ramas rotas.

## 12. Replay Graph v1
Une el ciclo de vida de una transacción:
`txPlan` → `signedTx` → `txReceipt` → `replayTrace` → `DAG Context`.
Permite visualizar dónde ocurrió una divergencia (ej: "Divergence found at Step 3: Local state != Node state").

## 13. DAG Graph API v1 (Research Model)
- **Status**: Explícitamente marcado como `light-model`.
- **Data**: Bloques simulados, inclusiones de transacciones y aristas de conflicto.
- **Warnings**: Debe incluir `consensusLimitations` explicando que es una simulación de debug y no de consenso real.

## 14. Event Sourcing Model v1
HardKas generará un log de eventos persistente para reconstruir el timeline del desarrollador:
- `artifact.created`
- `tx.sent`
- `replay.diverged`
- `dag.displaced`
- `l2.tx.built`
- `bridge.assumption.reported`

## 15. TX Aggregation v1 (Vista 360)
El comando `hardkas query tx <txId>` se convierte en la vista definitiva que agrega:
1. Todos los artefactos relacionados.
2. Timeline de eventos.
3. Grafo de replay.
4. Anotaciones de posición en el DAG.
5. Avisos de seguridad (Mainnet, Replay risks).

## 16. Web UI API v1
Contrato conceptual (Read-only):
- `GET /api/query/artifacts`: Listado paginado con filtros.
- `GET /api/query/tx/:txId`: Vista 360 de la transacción.
- `GET /api/query/lineage/:id`: Grafo de linaje.
- `GET /api/query/events`: Stream de eventos del workspace.

## 17. Store Freshness & Indexing
- **Auto-Sync**: El motor intenta sincronizar archivos nuevos al detectar cambios de mtime en el directorio `.hardkas/`.
- **Doctor**: Comando para detectar inconsistencias entre SQLite y el sistema de archivos.
- **Zombie Cleanup**: Eliminación de registros que apuntan a archivos borrados.

## 18. Security & Safety
- **Read-only by default**: La API de consulta no permite mutaciones de datos.
- **Path Traversal Protection**: Validación estricta de rutas de archivos.
- **Secret Redaction**: Filtro automático de campos `privateKey` y `mnemonic` antes de la serialización JSON.

## 19. Migration Plan
1. **Fase 1 (Wiring)**: Conectar `QueryEngine` con `SqliteQueryBackend`. Mantener el escaneo de disco como fallback.
2. **Fase 2 (Unified Envelope)**: Implementar el `QueryResult` JSON en todos los comandos del CLI.
3. **Fase 3 (Graph APIs)**: Implementar los adaptadores de dominio para Lineage y Replay.
4. **Fase 4 (Explain/Why)**: Añadir la lógica de inferencia y reporte de evidencias.
5. **Fase 5 (API/Web)**: Exponer la capa de servicios para herramientas externas.

## 20. Final Recommendation
El **Query Engine v1** debe ser tratado como la **columna vertebral de observabilidad** de HardKas. No es una funcionalidad secundaria; es lo que convierte una colección de archivos JSON en un sistema auditable, reproducible y profesional para el desarrollo en Kaspa.

---
### Checklist de Diseño
- [x] Explain mode definido.
- [x] Why mode (causalidad) diseñado.
- [x] DAG Graph API (Research) aclarado.
- [x] Replay Graph integrado.
- [x] Event Sourcing local modelado.
- [x] Web UI API conceptualizada.
- [x] Sin implementación de código (RFC documental).
