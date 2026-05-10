# HardKAS Architectural & Determinism Audit

## Executive Summary
Esta auditoría identifica fallos críticos en la infraestructura de determinismo y seguridad de HardKAS. El hallazgo más grave (P0) es la **incapacidad de producir artefactos reproducibles** debido a la inclusión de timestamps y aleatoriedad en el cálculo de hashes canónicos. Esto invalida el pilar de "Deterministic-by-Design" del framework. Asimismo, se han detectado riesgos de "Security Theater" en la gestión de sesiones y deuda técnica en el motor de indexación que compromete la escalabilidad del CLI.

---

## 1. Determinism

### [P0] Non-Deterministic Artifact Hashing & IDs
- **Problem**: Los hashes de contenido (`contentHash`) incluyen el campo `createdAt`, y los identificadores de planes (`planId`) utilizan `Math.random()` y `Date.now()`.
- **Why it matters**: Dos ejecuciones idénticas de `hardkas tx plan` producen artefactos con diferentes hashes e IDs. Esto rompe la reproducibilidad en CI/CD, el rastreo de linaje estable y la capacidad de verificar si una transacción es idéntica a una previa.
- **Minimal fix**: Excluir `createdAt` y `planId` del `canonicalStringify` en `artifacts/src/canonical.ts`. Derivar `planId` del hash de los inputs deterministas (from, to, amount, inputs, outputs).
- **Complexity**: Small
- **Category**: Architectural debt / Code problem

### [P1] Silent Non-Determinism in Query Indexer
- **Problem**: El indexador (`query-store/src/indexer.ts`) recalcula hashes si faltan, pero el proceso de cálculo depende de la versión del SDK instalada, no del estado del artefacto original.
- **Why it matters**: Si el algoritmo de hashing cambia, el índice SQLite se vuelve inconsistente con el sistema de archivos de forma silenciosa.
- **Minimal fix**: El indexador debe tratar el `contentHash` del JSON como la única fuente de verdad y marcar como `corrupted` cualquier archivo donde el hash recalculado no coincida con el declarado.
- **Complexity**: Trivial
- **Category**: Architectural debt

---

## 2. Security & Runtime

### [P1] Security Theater: Fake Session Locking
- **Problem**: El comando `hardkas accounts real lock` solo imprime un mensaje de consola (`Account locked`). No existe un daemon o proceso persistente que mantenga llaves en memoria, por lo que el "bloqueo" es puramente cosmético.
- **Why it matters**: Da una falsa sensación de seguridad al desarrollador, quien podría creer que su clave privada ha sido eliminada de un contexto de ejecución activo cuando nunca estuvo "viva" fuera del comando invocado.
- **Minimal fix**: O bien implementar un `HardkasSignerDaemon` real, o bien cambiar el mensaje para aclarar que no hay sesiones activas en el CLI (`No active session to lock`).
- **Complexity**: Trivial (Fix mensaje) / Large (Daemon)
- **Category**: Security risk / DX issue

### [P1] Secret Redaction Gap in Error Handlers
- **Problem**: `handleError` en `cli/src/ui.ts` imprime el mensaje de error completo. Si un error de nivel inferior (ej. del SDK de Kaspa o de un provider) incluye fragmentos de llaves privadas o mnemonics, estos se exponen en rojo en la terminal.
- **Why it matters**: Riesgo de filtración de secretos en logs, capturas de pantalla o terminales compartidas.
- **Minimal fix**: Implementar un middleware de redacción en `handleError` que use regex para detectar y enmascarar patrones de llaves privadas (64 hex chars) y mnemonics conocidos.
- **Complexity**: Small
- **Category**: Security risk

---

## 3. Query Layer & Observability

### [P2] Hardcoded Explain Logic
- **Problem**: El motor de consulta (`query/src/engine.ts`) devuelve un `executionPlan` hardcodeado (`["Discovery", "Filter", "Sort", "Paginate"]`) para todos los adaptadores.
- **Why it matters**: Invalida la feature de introspección profunda. El usuario cree que está viendo el plan de ejecución real cuando es un stub estático.
- **Minimal fix**: Permitir que cada `QueryAdapter` devuelva su propio plan de pasos durante la ejecución.
- **Complexity**: Small
- **Category**: DX issue

### [P2] Destructive Schema Migrations
- **Problem**: `query-store/src/db.ts` utiliza una estrategia de "Drop and Recreate" ante cualquier mismatch de versión del esquema.
- **Why it matters**: Los desarrolladores pierden todo su historial operativo (`events.jsonl` indexado, traces de workflows pasados) simplemente al actualizar el CLI.
- **Minimal fix**: Implementar un sistema de migraciones incremental (ej. `UP/DOWN` scripts) o, al menos, forzar un `rebuild` automático sin borrar metadatos de usuario si es posible.
- **Complexity**: Medium
- **Category**: Architectural debt

---

## 4. Documentation & CLI Coherence

### [P2] Outdated "What Actually Works" Document
- **Problem**: `docs/what-actually-works.md` lista el `Query Store (SQLite)` como **BROKEN / UNWIRED**, pero el código ya lo tiene conectado por defecto.
- **Why it matters**: Los usuarios nuevos ignorarán las capacidades de introspección del framework creyendo que no son funcionales.
- **Minimal fix**: Sincronizar el documento con el estado real del PR #102 (Store wiring).
- **Complexity**: Trivial
- **Category**: Documentation problem

### [P3] Zombie Command Suggestion in Doctor
- **Problem**: `hardkas doctor` sugiere ejecutar `hardkas query store index`, pero el comando real es `rebuild`.
- **Why it matters**: Fricción innecesaria y sensación de falta de pulido en la herramienta de "salud".
- **Minimal fix**: Cambiar el string de sugerencia en `packages/cli/src/commands/doctor.ts`.
- **Complexity**: Trivial
- **Category**: DX issue

---

## 5. Summary of Findings

| Estado | Count | Severidad P0/P1 |
| :--- | :--- | :--- |
| **P0 (Critical)** | 1 | Determinismo de Artefactos |
| **P1 (High)** | 3 | Secret Redaction, Fake Locking, Indexer Integrity |
| **P2 (Medium)** | 3 | Explain stubs, Schema migrations, Outdated docs |
| **P3 (Low)** | 1 | Doctor suggestions |

---

## 6. Recommendations

### Immediate (Next 24h)
1. **Fix Hashing (P0)**: Excluir metadatos variables del hash canónico para habilitar CI/CD estable.
2. **Fix Doctor (P3)**: Alinear nombres de comandos para evitar el error de "Unknown command".

### Hardening (Sprint actual)
1. **RedactSecrets (P1)**: Añadir el filtro de seguridad al `handleError`.
2. **Wired Docs (P2)**: Declarar el Query Engine como funcional para incentivar el testing de la comunidad.

---

## 7. Guardrails

- No se modificó lógica runtime.
- No se modificaron runners.
- No se modificaron packages internos.
- El diagnóstico se basa en la inspección de código fuente y cumplimiento de la arquitectura "Deterministic-by-Design".
