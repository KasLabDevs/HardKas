# PLAN DE ACCIÓN Y REMEDIACIÓN PRIORIZADA (`PLAN_DE_ACCION.md`)

## 1. Objetivo del Plan

Este documento establece la hoja de ruta técnica accionable que el equipo de **HardKAS** debe ejecutar sobre `v0.13.0-rc.2` **antes de solicitar una evaluación o certificación externa formal ISO/IEC 25010:2023 o una auditoría criptográfica de terceros**.

Las acciones correctivas se clasifican en **Críticas**, **Altas**, **Medias** y **Bajas**, con trazabilidad directa a los hallazgos (`HAL-*`) y requisitos (`HK-REQ-*`).

---

## 2. Clasificación de Acciones Correctivas

### 2.1 Acciones CRÍTICAS (Bloqueantes absolutas si se habilitara Mainnet en el futuro)

> [!IMPORTANT]
> En `v0.13.0-rc.2`, Kaspa Mainnet e Igra Mainnet están **100 % bloqueadas por código** (`MAINNET_CONNECTIONS_ENABLED = false`, `MAINNET_TRANSACTIONS_ENABLED = false`). Por ello no existe riesgo inmediato de pérdida de fondos reales en `0.13.0-rc.2`. No obstante, **antes de cualquier futura versión `1.0` que habilite Mainnet**, las siguientes 2 acciones son **Críticas**:

1. **`ACC-CRIT-01` — Vincular Outpoint/Estado en Flujos ZK P2SH Reutilizables (`HAL-10` / `HK-REQ-046`)**:
   - **Paquete**: `@hardkas/sdk` (`packages/sdk/src/zk/toccata.ts#L248-L280`, `#L979-L985`).
   - **Acción**: Impedir por API en modo `proof-and-output-bound` la reutilización de una misma dirección P2SH ZK sin estado o exigir su composición automática con un covenant con estado Toccata V1 que incremente un contador/nonce de transición en L1.
2. **`ACC-CRIT-02` — Eliminar Claves Sintéticas de `WalletToolkit` antes de soportar redes públicas (`HAL-06` / `HK-REQ-055`)**:
   - **Paquete**: `@hardkas/toolkit` (`packages/toolkit/src/wallet.ts#L156-L201`).
   - **Acción**: Reemplazar la derivación determinista basada en el nombre de la billetera por la integración directa con `AccountManager` y keystores cifrados Argon2id + AES-256-GCM de `@hardkas/accounts`, eliminando además los métodos stub `planSend()` y `sendSimulated()`.

---

### 2.2 Acciones ALTAS (Obligatorias antes de cerrar la Release Candidate `0.13.0` y solicitar auditoría externa)

1. **`ACC-ALTA-01` — Invocar `assertBroadcastNodeSynced` en `WalletToolkit.verifySpendNetwork` (`HAL-01` / `HK-REQ-054`)**:
   - **Archivo**: `packages/toolkit/src/wallet.ts#L435-L441`.
   - **Cambio exacto**: Añadir `await assertBroadcastNodeSynced(this.rpcClient);` inmediatamente después de `await assertBroadcastNodeIdentity(this.rpcClient, this.network);` en `verifySpendNetwork()`, y actualizar la tabla de `docs/status/send-routes-security.md#L69`.
   - **Esfuerzo estimado**: < 1 hora (incluyendo test unitario de rechazo ante `isSynced: false`).
2. **`ACC-ALTA-02` — Escritura Atómica y Bloqueo Jerárquico en `ProjectionStoreJson.setAll` (`HAL-02` / `HK-REQ-056`)**:
   - **Archivo**: `packages/query-store/src/projection-store.ts#L35-L40`.
   - **Cambio exacto**: Reemplazar `fs.writeFileSync(tmp, ...)` + `fs.renameSync(tmp, this.filePath)` por `writeFileAtomicSync` (con `fsyncSync`, sufijo `.pid.random.tmp` y reintentos `EPERM` en Windows) envuelto en `withFileLock(this.filePath, LOCK_ORDER.index, ...)`.
   - **Esfuerzo estimado**: 2 horas (incluyendo test de escritura concurrente).
3. **`ACC-ALTA-03` — Poblar el Corpus de Fixtures Válidos (`packages/artifacts/test/fixtures/valid`) (`HAL-03` / `HK-REQ-071`)**:
   - **Directorio y Script**: `packages/artifacts/test/fixtures/valid/` y `scripts/check-artifact-fixtures.mjs`.
   - **Cambio exacto**: Generar y versionar fixtures canónicas válidas con `hashVersion: 5` para todos los esquemas registrados en `@hardkas/artifacts` (`deployment`, `execution-receipt`, `evidence-pack`, `tx-plan`, `signed-tx`, `scenario-result`, etc.) de modo que `pnpm check:artifacts` finalice con **Exit Code 0**.
   - **Esfuerzo estimado**: 2–3 horas.
4. **`ACC-ALTA-04` — Corregir los 4 Enlaces Rotos que hacen fallar `pnpm docs:check` (`HAL-04` / `HK-REQ-070`)**:
   - **Archivos**:
     - `docs/community/rc-0.13.0-rc.1/EVIDENCE_INDEX.md` (resolver enlaces a `X_POST.md` y `DISCORD_ANNOUNCEMENT.md`).
     - `docs/internal/audit/surface-2026-11-09/inventario.md` (reemplazar las 2 rutas absolutas `C:\Users\jrodr\hkl1\rc2\...` por rutas relativas del repositorio).
   - **Verificación**: Ejecutar `node scripts/docs-check.mjs` y confirmar **Exit Code 0**.
   - **Esfuerzo estimado**: 30 minutos.

---

### 2.3 Acciones MEDIAS (Recomendadas para elevar la puntuación de Mantenibilidad, Compatibilidad y Rendimiento por encima del 90 %)

1. **`ACC-MED-01` — Remediar el Gate `scripts/check-typescript-hygiene.mjs` (`HAL-05` / `HK-REQ-069`)**:
   - **Alcance**: Migrar las cláusulas `catch (e: any)` / `catch (err: any)` a `catch (e: unknown)` con funciones helper de estrechamiento de tipos (`e instanceof Error`) en `accounts`, `artifacts`, `cli`, `sdk`, `simulator`, `testing`, `toolkit` y `tx-builder`, hasta que `node scripts/check-typescript-hygiene.mjs` devuelva **Exit Code 0**.
2. **`ACC-MED-02` — Limpiar o Implementar `HardkasCovenants.planDeploy` y `planSpend` (`HAL-07` / `HK-REQ-045`)**:
   - **Archivo**: `packages/sdk/src/covenants.ts#L494-L516`.
   - **Acción**: Eliminar de la superficie pública estos dos métodos obsoletos que lanzan `COVENANT_PLAN_UNSUPPORTED` (o redirigirlos internamente al planificador Toccata V1).
3. **`ACC-MED-03` — Añadir Rate Limiting por IP en `@hardkas/dev-server` (`HAL-08` / `HK-REQ-067`)**:
   - **Archivo**: `packages/dev-server/src/server.ts#L74-L205`.
   - **Acción**: Incorporar un limitador en memoria por dirección IP (ej. $\le 60\text{ peticiones/minuto}$ en `/api/*`, especialmente activo con `--unsafe-external`) que responda con `HTTP 429 Too Many Requests`.
4. **`ACC-MED-04` — Añadir Soporte de Token Bearer en `@hardkas/client` y Suites de Tests en Paquetes Privados (`HAL-12` / `HK-REQ-058`, `HK-REQ-068`)**:
   - **Paquetes**: `@hardkas/client`, `@hardkas/react`, `@hardkas/storage-postgres`, `@hardkas/storage-sqlite`, `@hardkas/plugin-local-indexer`, `@hardkas/simulator-adapters`.
   - **Acción**: Permitir configurar `bearerToken` y cabecera `X-Hardkas-Request: true` en `@hardkas/client`, y añadir pruebas unitarias antes de considerar su promoción a paquetes publicables.
5. **`ACC-MED-05` — Actualizar `@hardkas/pskt-native` a `rusty-kaspa 2.1.0` o mantener su exclusión explícita (`HAL-12` / `HK-REQ-047`)**:
   - **Paquete**: `packages/pskt-native`.
   - **Acción**: Alinear dependencias Cargo con `rusty-kaspa v2.1.0`, generar definiciones en `index.d.ts`, endurecer las precondiciones del firmante (`HK-13`) y compilar binarios multiplataforma con hash de procedencia SHA-256 antes de cualquier publicación.
6. **`ACC-MED-06` — Automatizar Consolidación Preventiva ante `LFU-UTXO-READ-LIMIT` en `localnet` (`HAL-11` / `HK-REQ-036`)**:
   - **Paquetes**: `@hardkas/localnet`, `@hardkas/kaspa-rpc`.
   - **Acción**: Emitir una advertencia temprana cuando el conteo de UTXOs coinbase de minería supere un umbral configurable (ej. 25.000 UTXOs) u ofrecer una bandera `--auto-consolidate` en `localnet`.

---

### 2.4 Acciones BAJAS (Higiene del Repositorio y Documentación)

1. **`ACC-BAJA-01` — Eliminar `packages/.hardkas/store.db` y proteger `.gitignore` (`HAL-13`)**:
   - Borrar el archivo binario residual `packages/.hardkas/store.db` del árbol de trabajo y asegurar que `**/.hardkas/` esté excluido en `.gitignore`.
2. **`ACC-BAJA-02` — Normalizar rutas cortas 8.3 de Windows en el arnés de pruebas de CLI (`HAL-14` / `HK-REQ-012`, `HK-REQ-072`)**:
   - Aplicar `fs.realpathSync.native` al crear directorios temporales en los tests de `@hardkas/cli` para evitar fallos de comparación de rutas con `~` en cuentas de usuario Windows de más de 8 caracteres.
3. **`ACC-BAJA-03` —Incluir los 4 paquetes internos omitidos en `PUBLIC_API_SURFACE.md` (`HK-REQ-058`)**:
   - Añadir `@hardkas/storage-postgres`, `@hardkas/storage-sqlite`, `@hardkas/sync-daemon` y `@hardkas/testnet-qualification` como paquetes `internal` en el generador de `PUBLIC_API_SURFACE.md` para que los 35 paquetes del workspace estén inventariados al 100 %.

---

## 3. Impacto Proyectado tras Ejecutar el Plan de Acción

Si se ejecutan las **4 Acciones Altas (`ACC-ALTA-01` a `ACC-ALTA-04`)** y las **3 primeras Acciones Medias (`ACC-MED-01` a `ACC-MED-03`)** (~1,5 días de ingeniería):
- El **100 % de los 11 scripts de gate** del repositorio pasarán con **Exit Code 0**.
- Los requisitos incumplidos caerán de **12 a 5** (quedando únicamente las brechas de protocolo deliberadamente fail-closed como ECDSA/`lockTime` y los paquetes privados retenidos).
- La puntuación global ponderada ISO/IEC 25010:2023 ascenderá del **76,39 % actual al 86,11 %** (y **> 94 %** sobre los 22 paquetes publicados).
