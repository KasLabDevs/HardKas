# HardKas Artifact Engine Audit

## 1. Scope
Esta auditoría analiza el motor de artefactos de HardKas y su ecosistema de tipado. El enfoque abarca:
- El sistema de esquemas basado en Zod (`packages/artifacts/src/schemas.ts`).
- Identificadores (IDs) e integridad.
- Estructuras formales de linaje (`lineage.ts`).
- Algoritmos de hashing y serialización (`canonical.ts`).
- Reproducibilidad y determinismo para integraciones de CI/CD.
- Estrategias de compatibilidad hacia atrás y versionado evolutivo.

## 2. Executive Summary
El Artifact Engine de HardKas es sorprendentemente robusto y está diseñado con una mentalidad orientada a DAGs (Directed Acyclic Graphs) y trazabilidad. Utiliza `Zod` de manera consistente para la validación de esquemas en tiempo de ejecución (`verify.ts`) y ha implementado una serialización canónica para estabilizar los hashes. Posee una base sólida para soporte formal de `lineage` y migraciones automáticas de esquemas antiguos (v1 -> v2).

Sin embargo, el determinismo a nivel de identidad falla por la inclusión de metadatos temporales. Aunque el pipeline de validación y hashing es sólido, regenerar un artefacto produce un hash distinto debido a campos como `createdAt`.

**Clasificación del sistema:**
- Schema system: **GOOD**
- Artifact hashing: **GOOD** (Algoritmo canónico estable)
- Deterministic reproducibility: **NEEDS HARDENING** (Afectado por metadatos)
- Lineage model: **GOOD** (Modelo formal implementado)
- Backward compatibility: **PARTIAL** (Migraciones básicas presentes)
- Serialization stability: **GOOD**

## 3. Artifact Inventory

| Artifact | Schema | Produced by | Consumed by | Versioned | Deterministic |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `txPlan` | `hardkas.txPlan` | `tx plan` | `tx sign` | YES (`1.0.0-alpha`) | NO |
| `signedTx` | `hardkas.signedTx` | `tx sign` | `tx send` | YES (`1.0.0-alpha`) | NO |
| `txReceipt`| `hardkas.txReceipt`| `tx send` | - | YES (`1.0.0-alpha`) | NO |
| `snapshot` | `hardkas.snapshot` | State engine | Replay | YES (`1.0.0-alpha`) | NO |
| `txTrace` | `hardkas.txTrace` | `tx trace` | Debugger | YES (`1.0.0-alpha`) | NO |
| `igra-*` | `hardkas.igra.*` | L2 runners | L2 nodes | YES (Shared base)| NO |

*(Nota: "Deterministic" se refiere a si múltiples ejecuciones idénticas generan el mismo `contentHash` final).*

## 4. Zod Schema Audit

| Schema | Zod | Runtime validation | Strict mode | Versioned | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `BaseArtifactSchema`| `z.object` | `verifyArtifactIntegrity` | NO (`.strict()` missing) | YES | Define base para todos |
| `TxPlanSchema` | `extend` | `verifyArtifactIntegrity` | NO | YES | `amountSompi` as string |
| `SignedTxSchema` | `extend` | `verifyArtifactIntegrity` | NO | YES | Enum unions |
| `TxReceiptSchema` | `extend` | `verifyArtifactIntegrity` | NO | YES | Optional fields used heavily |

**Análisis Zod:**
- **Runtime Validation:** Implementado mediante `safeParse` en el módulo de verificación.
- **Strict Mode:** No se utiliza `.strict()`. Zod omitirá campos desconocidos durante el `safeParse` si se intentara inferir, pero al usar el objeto original para el hashing, los campos extra podrían afectar el hash (el validador no purga el JSON original de campos no declarados).
- **BigInt Handling:** Zod tipa los valores monetarios como `z.string()`, delegando la conversión a `bigIntReplacer` en `io.ts`.

## 5. Schema Versioning

| Artifact | Version field | Migration support | Compatibility risk |
| :--- | :--- | :--- | :--- |
| All Base | `version` (`1.0.0-alpha`) | YES (`migrateToCanonical`) | LOW |
| All Base | `hardkasVersion` | NO (Informational) | LOW |

**Estrategia Evolutiva:**
HardKas utiliza `migration.ts` para portar artefactos v1 al esquema V2 (`ARTIFACT_VERSION`).
El adaptador `migrateToCanonical` modifica esquemas (ej. `.v1` -> base), mapea campos obsoletos (`selectedUtxos` -> `inputs`) e inyecta valores faltantes (`hardkasVersion`). Esta es una arquitectura correcta para *forward compatibility*.

## 6. Deterministic ID Review

| Artifact | ID Source | Deterministic | Risk |
| :--- | :--- | :--- | :--- |
| `txPlan` | `planId` | **NO** (Randomized/Time-based) | HIGH |
| `signedTx` | `signedId` | **NO** (Uses `Date.now()`) | HIGH |
| `contentHash`| Payload Hash | **NO** (Includes IDs & Dates) | HIGH |
| `txId` | Schnorr Math | YES | LOW |

**Hallazgo Crítico:** 
El sistema de identidad (`contentHash`) depende fuertemente de `createdAt` y de los IDs ad-hoc como `planId` o `signedId`. Dado que estos varían por ejecución, **el determinismo de CI/CD es nulo en cuanto a integridad referencial del artefacto**, aunque el determinismo funcional (el payload de Kaspa) sea perfecto.

## 7. Hashing Review

| Hash Target | Method | Canonicalized | Stable | Risk |
| :--- | :--- | :--- | :--- | :--- |
| `contentHash` | `calculateContentHash` | YES | YES | LOW |

**Análisis de Serialización y Hashing:**
El archivo `canonical.ts` implementa una serialización excepcionalmente estable:
- Ordenamiento alfabético recursivo de keys.
- Conversión explícita de `bigint` a `string`.
- Exclusión explícita de los campos `contentHash`, `artifactId` y `lineage` para no alterar el cálculo de la propia identidad o grafo.
- Remoción equivalente a `JSON.stringify` de valores `undefined`.

*Problema de Hashing:* No es un problema del algoritmo de hash (que es puro y estable), sino de los *inputs* que recibe (timestamps).

## 8. Lineage Review

| Feature | Present | Deterministic | Notes |
| :--- | :--- | :--- | :--- |
| Lineage block | YES | YES (Schema) | `ArtifactLineageSchema` define la topología formal. |
| `sourcePlanId` | YES | NO | Propiedad ad-hoc obsoleta conviviendo con lineage. |
| Verification | YES | YES | `verifyLineage` hace validación estructural y encadenamiento de secuencias. |

**Arquitectura de Linaje:**
HardKas implementa un sistema de linaje sorprendentemente profundo en `lineage.ts`. Valida:
- Continuidad de IDs (`parentArtifactId` vs parent `artifactId`).
- Continuidad de hashes (`contentHash` match).
- Secuencialidad (`sequence`).
- Transiciones válidas (ej. no dejar que un `signedTx` sea padre de un `snapshot`).

## 9. Serialization Stability

| Serialization Area | Stable | Risk |
| :--- | :--- | :--- |
| JSON serialization | YES | LOW |
| Canonical Sorting | YES | LOW |
| BigInt formatting | YES | LOW |
| Undefined stripping | YES | LOW |

La función `canonicalStringify` provee la estabilidad necesaria para que la serialización no se vea afectada por motores de JavaScript dispares o cambios incidentales de orden al deserializar/serializar.

## 10. Replay / CI Determinism

**same inputs → same artifacts?** -> **NO.**

| Artifact | Replay-safe | CI deterministic | Notes |
| :--- | :--- | :--- | :--- |
| Payload | YES | YES | Genera la misma tx matemática |
| Artifact ID | NO | NO | Rompe caching y lineage validation pura |

Al no ser *CI deterministic*, no es posible re-ejecutar un workflow de HardKas en un CI y afirmar mediante hashes que el resultado es idéntico a ejecuciones previas (dado que el `contentHash` cambiará por el timestamp).

## 11. Compatibility Review

| Compatibility Area | Status | Risk | Recommendation |
| :--- | :--- | :--- | :--- |
| Old artifact loading | GOOD | LOW | `migrateToCanonical` is active. |
| Unknown fields | WEAK | MEDIUM| Falta usar `.strict()` en Zod, permite ruido en el JSON final. |
| Future evolution | GOOD | LOW | Diseño basado en type strings y versionado semántico. |

## 12. Architectural Findings

### GOOD
- **Serialización Canónica**: Implementación nativa robusta que resuelve el clásico problema de JS ordering.
- **Zod Runtime Validation**: Las interfaces no son solo TypeScript, se validan dinámicamente en `verify.ts`.
- **Estructura de Linaje Formal**: Reglas de validación sofisticadas para encadenamiento y transiciones de estado.
- **Migration Engine**: Adaptadores `migrateToCanonical` integrados correctamente.

### NEEDS HARDENING
- **Timestamps en el Hashing**: `createdAt` y otros IDs aleatorios se incluyen en el payload del hash, destruyendo la reproducibilidad del artefacto.
- **Falta de Strict Mode**: Al permitir campos adicionales no tipados en Zod, el `contentHash` es susceptible a ataques de mutación donde un campo invisible altera la firma del artefacto.

## 13. Recommendations

### P0 — Deterministic Hardening
- **Metadata Exclusion**: En `canonical.ts`, excluir explícitamente campos que rompen la identidad (`createdAt`, `planId`, `signedId`) del algoritmo de serialización. 
- **Hash-based IDs**: Los IDs de los artefactos (`planId`, `signedId`) deberían derivarse matemáticamente del `contentHash` en lugar de ser aleatorios o basados en tiempo.

### P1 — Compatibility & Strictness
- **Zod Strict Mode**: Modificar los esquemas Zod en `schemas.ts` para que utilicen `.strict()`. Esto prevendrá que campos arbitrarios inyectados manualmente afecten el `contentHash`.
- **Consolidar Linaje**: Deprecar y eliminar los campos ad-hoc (`sourcePlanId`) a favor del uso exclusivo del bloque formal `lineage`.

### P2 — Ecosystem
- **Lineage Builder Helper**: Crear abstracciones que faciliten la construcción inmutable de los bloques `lineage` sin que cada runner tenga que lidiar con la lógica de generación manual.

## 14. Proposed Artifact Engine v1

El modelo ideal (Endurecido):

```typescript
// En canonical.ts
const excludedFromIdentity = [
  "contentHash", 
  "artifactId", 
  "lineage", 
  "createdAt", // ! Nuevo
  "planId",    // ! Nuevo
  "signedId"   // ! Nuevo
];

export function calculateIdentityHash(obj: any): string {
  const canonical = canonicalStringify(obj, excludedFromIdentity);
  return sha256(canonical);
}
```

Al excluir la temporalidad, el framework garantiza que:
`Inputs + Protocol = Stable Hash Identity`

## 15. Tests Recommended
- Same artifact re-serialized gives exactly same `contentHash`.
- Reordered JSON keys yield same `contentHash`.
- `createdAt` modification does not alter `contentHash`.
- Zod rejects unknown fields (requiere strict mode).
- Deterministic lineage reconstruction passes `verifyLineage`.
- v1 to v2 migration yields correct hashes.
- BigInts remain stable across environments.

## 16. Final Assessment

¿HardKas Artifact Engine ya es apto para entornos profesionales?
**Sí, con reservas.** La arquitectura es madura, usa Zod correctamente, tipa el linaje y maneja migraciones de versión. Posee todas las capacidades de un sistema de orquestación (DAG-oriented) de grado infraestructura.
**Pero necesita endurecimiento (Hardening) inmediato:** Su falta de purga de metadatos temporales en el cálculo del hash lo inhabilita actualmente para cumplir la promesa de "Deterministic CI/CD". Corregir el alcance del `canonicalStringify` es el único paso crítico faltante.

## 17. Checklist

- [x] Enumerar schemas
- [x] Revisar versionado
- [x] Revisar deterministic IDs
- [x] Revisar lineage hashes
- [x] Revisar compatibility
- [x] No modificar lógica runtime
- [x] No modificar schemas
- [x] No modificar hashing
- [x] Auditoría documental únicamente

## Guardrails
- No se modificó lógica runtime.
- No se modificaron schemas.
- No se modificó hashing.
- No se modificaron artifacts.
- Esta auditoría es documental.
