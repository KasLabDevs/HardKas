# Bloque "primer contacto" — ledger

Mandato (propietario, 2026-09-26, "Venga dale cañita"): el bloque propuesto tras la prueba de uso real del rc.23 publicado — E01 (el SDK no guarda el plan), E03 + E07 (versión de hash en los productores), una prueba de recién llegado barata y los retoques de minutos (volcado DEBUG, `account(s, { cwd })`, etiqueta `(encrypted)`, ejemplo de la guía con código de salida y aviso de módulo ES). Fuera: Ola 2 (f), E02, AUD-21/Q10, E04. Nada commiteado; versión sin tocar (publicar los arreglos requiere una versión nueva: decisión del propietario).

Base: HEAD `de6b2da7d` (commit del propietario con el arreglo de CI y los docs regenerados).

## 1. Reproducción (ANTES)

| Run | Qué ejecuta | Resultado ANTES |
|---|---|---|
| `fc-e01-before` | SDK en proceso: quickstart, `send`, `localnet.fund`/`accounts.fund`, plan en el almacén, manipulación | 5 de 7 fallan con `parent_plan_unresolved` / plan ausente / manipulación no detectada en `sign` |
| `fc-cli-before` | Proyecto consumidor con los `dist` anteriores: código de `docs/start/quickstart.md` y del README tal cual, `hardkas init .` + su test con vitest, guía de tareas | 5 de 5 fallan: `parent_plan_unresolved` ×3, `HASH_VERSION_MISSING` ×2 |
| `fc-e07-before` | Registro de `silver compile` publicado, resultados de escenario, índice estricto con `runs/`, `reports/`, `deployments/`, `kaspad/` | Silver: `ARTIFACT_SCHEMA_INVALID artifactId`; índice estricto aborta; escenario: esquema desconocido |

## 2. Arreglos

| ID | Causa raíz | Arreglo | Ficheros |
|---|---|---|---|
| E01 | Desde la Ola 1.4 `simulate`/`send` resuelven el plan solo del almacén por `authorization.planArtifactId`, y la verificación estricta exige el padre en el almacén. `sign()` guardaba el firmado pero no el plan que autoriza. | `sign()` guarda el plan que autoriza (si no está) justo antes del firmado. Si hay una copia con esa identidad que no verifica, el resolver lanza `CANDIDATE_INVALID` y no se firma nada: nunca se sobrescribe evidencia manipulada. La vinculación no cambia. | `packages/sdk/src/tx.ts` (`persistAuthorizedPlan`, dos puntos de escritura) |
| E03 | El registro de tarea era JSON improvisado sin `schema`/`hashVersion`/`contentHash`; el escritor lo rechaza desde N3 (Ola 1.1) después de que la acción ya se ejecutó. | La tarea se registra como `hardkas.scenarioResult.v1` sellado v5 con `metadata {kind:"task", taskName, runId, args, result}`, en el almacén. | `packages/cli/src/commands/task.ts` |
| E07-a | El arnés de escenarios (`@hardkas/testing/scenarios`) escribía resultados sin sellar y con `mode:"agent"` (no es un modo de ejecución). | Mismo productor sellado; `mode` derivado de la red (`simulator`/`localnet`/`rpc`). | `packages/testing/src/scenarios.ts` |
| E07-b | Ningún productor único de `scenarioResult`; el verificador no conocía el esquema (lo marcaba "desconocido"). | `createScenarioResultArtifact` + `scenarioModeForNetwork` en `@hardkas/artifacts`; `verify` valida `ScenarioResultSchema`. | `packages/artifacts/src/scenario-result.ts` (nuevo), `index.ts`, `verify.ts` |
| E07-c | Los registros v5 de Silver no llevan `artifactId` (IC-7.3) pero el esquema Zod lo exigía: el verificador rechazaba todo lo que emite `silver compile`. | `artifactId` opcional en `SilverRecordBaseSchema`; un v5 que lo lleve sigue rechazado por `FORBIDDEN_IDENTITY_FIELD`. | `packages/artifacts/src/schemas.ts` |
| E07-d | El índice recorría todo `.hardkas/` y trataba salida operativa como artefactos; en modo estricto (`hardkas dev`) el primero abortaba el arranque. | Excluidos del recorrido `runs/`, `reports/`, `deployments/`, `kaspad/` (junto a los ya excluidos). Un artefacto canónico manipulado sigue reportándose y abortando el modo estricto. | `packages/query-store/src/indexer.ts` |
| E22 | `console.log("DEBUG SDK TX PLAN …")` con todos los UTXO en cada plan simulado. | Eliminado. | `packages/sdk/src/tx.ts` |
| E24 | Texto `Generated 1 real dev account(s, { cwd })`. | `Generated 1 real dev account(s)`. | `packages/cli/src/runners/accounts-real-generate-runner.ts` |
| E25 | `accounts list` etiquetaba `(encrypted)` toda cuenta `kaspa` sin variable de entorno. | `(encrypted)` solo con keystore cifrado; `(plaintext key)` con clave en claro. | `packages/cli/src/commands/accounts.ts` |
| E23/E06 | El ejemplo del quickstart salía con 0 al fallar y no avisaba de que el SDK es ESM. | `process.exitCode = 1` en el `catch`; párrafo sobre `"type": "module"`. | `docs/start/quickstart.md` |

## 3. Pruebas nuevas

| Fichero | Casos | Qué fija |
|---|---|---|
| `packages/sdk/test/adversarial/first-contact-e01-sign-persists-plan.test.ts` | 7 | flujo de la guía, `send`, `localnet.fund`/`accounts.fund`, plan en almacén FULL, idempotencia, copia manipulada ⇒ `CANDIDATE_INVALID` sin sobrescribir ni firmar, vinculación ⇒ `PARENT_PLAN_MISMATCH` |
| `packages/artifacts/test/adversarial/first-contact-e07-producers.test.ts` | 7 | resultado de escenario y de tarea sellados FULL, metadatos autenticados, forma antigua rechazada, registro Silver real del rc.23 publicado verifica, v5 con `artifactId` rechazado, manipulación detectada |
| `packages/query-store/test/first-contact-e07-indexer-scope.test.ts` | 2 | índice estricto sin falsos corruptos; artefacto manipulado sigue abortando |
| `packages/cli/test/first-contact-newcomer.test.ts` (+ `first-contact-helpers.ts`) | 3 | código de la guía y del README **tal cual**, en un proyecto consumidor que resuelve `@hardkas/*` por `node_modules` → `dist`; `hardkas init .` + su test ejecutado con vitest dentro del proyecto |
| `packages/cli/test/first-contact-e03-tasks.test.ts` | 2 | guía de tareas tal cual: `task hello --json` y `--evidence` + `evidence verify` |
| `packages/cli/test/first-contact-small-fixes.test.ts` | 3 | texto de `generate`, etiqueta de `accounts list`, ejemplo de la guía |

Fixture: `packages/artifacts/test/fixtures/first-contact/silverCompile-v5.published-rc23.json` = registro escrito por el CLI publicado (sin rutas locales, comprobado).

## 4. Verificación (DESPUÉS)

| Run | Resultado |
|---|---|
| `fc-e01-after2` | 7 / 7 |
| `fc-e07-after2` | 9 / 9 |
| `fc-all-after2` (los 6 ficheros del bloque, dist recompilados) | **24 / 24**, gate hermético PASS |
| Plantilla `payment-app`, `npm run transfer` en proyecto consumidor | exit 0, recibo `synthetic-…` (antes: `parent_plan_unresolved`) |
| `pnpm build` / `pnpm typecheck` | 47/47 · 55/55, 0 errores; binario nativo y `labs/` restaurados |
| Batería completa `fc-full1` | 858 ficheros · 1906 correctas · **2 fallos** · 28 omitidas: `sdk/test/lifecycle-trust.test.ts` caso 8 y `sdk/test/adversarial/wave1-2-sdk-identity.test.ts` "resolve the parent plan…". Ambos fijaban la precondición anterior ("el plan no está en el almacén después de `sign`"). |
| Reajuste de esos dos tests (`fc-rebase1`) | 15 / 15. La propiedad se mantiene: se borra el plan de donde el almacén lo guarda ahora (`artifacts/plans/`) y `simulate` sigue fallando con `parent_plan_unresolved`; el test de Wave 1.2 conserva también `PARENT_PLAN_MISMATCH` y la aceptación con el plan correcto. El caso 8 ya intentaba borrar el plan, pero solo en la raíz y con el nombre antiguo `plan-`. |
| Batería completa `fc-full2` | **858 ficheros · 1908 correctas · 0 fallos · 28 omitidas**, gate hermético PASS, 0 intentos fuera de loopback (613 s). Antes del bloque (2(e)): 1884/0/28. |
| Lint (`sdk`, `artifacts`, `query-store`, `testing`, `cli`) | Solo los errores preexistentes en ficheros no tocados: `sdk` 2 (`igra.ts`, `pskt/adapters/test-fake.ts`), `cli` 3 (`torture-runner.ts` ×2, `templates/wallet-backend/…/WalletService.test.ts`). `artifacts` limpio; `query-store` y `testing` solo avisos. |

## 5. Decisiones derivadas (para revisión)

1. **Guardar en `sign()`, no en `plan()`.** `sign()` ya persistía siempre el firmado; su sujeto es el plan. Guardar en `plan()` habría exigido otra opción y tocar el workflow. Consecuencia: en un workflow en modo prueba, `sign()` ya escribía el firmado (preexistente) y ahora escribe también su plan. Hacer que `sign()` respete el modo prueba es un punto aparte.
2. **Nunca sobrescribir.** Solo se escribe si el resolver dice `ARTIFACT_NOT_FOUND`; cualquier otro error se propaga (`CANDIDATE_INVALID`).
3. **Un productor de `scenarioResult`.** Escenarios y tareas lo comparten; la tarea va con `metadata.kind = "task"`. El registro de tarea queda en `artifacts/misc/` (el `fileName` anterior nunca llegó a escribirse porque la escritura fallaba antes).
4. **Índice: exclusión mínima.** Se excluyen cuatro carpetas operativas. Indexar solo `.hardkas/artifacts/**` es AUD-43 (Ola 5). Los registros de despliegue siguen sin esquema registrado (registros de deployment de la Ola 2, R-iii parte 2).
5. **E04 bloquea el test de `init`.** Con E01 resuelto, el test generado por `init` recorre plan → firma → envío y falla en la comprobación de saldo (Bob −990 KAS en vez de +10) por la doble identidad del simulador. No se arregla aquí (Medio, cambia el modelo de estado y hashes del simulador). El caso queda **fijado** al síntoma exacto: cuando se arregle E04 fallará a propósito y habrá que darle la vuelta a `status 0, 1 passed`.
6. **Observado, preexistente:** el índice omite ficheros ya indexados con la misma mtime, así que el modo estricto no vuelve a reportar un corrupto ya indexado en modo laxo (AUD-43).
7. **Árbol de trabajo ajeno:** `packages/pskt-native/package.json` y `npm/win32-x64-msvc/package.json` están modificados fuera de este bloque y vuelven a añadir la `optionalDependency` que la Ola 0 quitó por AUD-01 (riesgo de `--frozen-lockfile`). No los he tocado.

## 6. No hecho en este bloque

- E27 (mensaje de `init` que anuncia `payment.scenario.ts`), fuera de la lista acordada.
- La página del sitio (`apps/docs/docs/getting-started/quickstart.md`) es otro texto; queda para la Ola 10.
- `payment-app` no tiene tests propios (`npm test` sin ficheros).
