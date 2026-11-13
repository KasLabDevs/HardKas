# REGISTRO ESTRUCTURADO DE HALLAZGOS DE AUDITORÍA (`HALLAZGOS.md`)

## 1. Resumen de Hallazgos por Severidad

Durante la verificación cruzada entre los **72 requisitos (`HK-REQ-001` a `HK-REQ-072`)**, el código fuente de los **35 paquetes** y la ejecución empírica de los **11 scripts de control (gates)** de HardKAS `v0.13.0-rc.2`, se han identificado **16 hallazgos verificables**, clasificados según su criticidad e impacto en seguridad, fiabilidad, mantenibilidad y cumplimiento ISO/IEC 25010:2023:

| Severidad | Cantidad | Descripción del Impacto |
| :--- | :---: | :--- |
| **CRÍTICA** | **0** | No se detectaron vulnerabilidades de pérdida directa de fondos en mainnet (Mainnet está 100 % bloqueada en código en L1 y L2) ni ejecución remota de código (RCE). |
| **ALTA** | **4** | Incumplimientos en guardias de sincronización antes de firmar/transmitir (`WalletToolkit`), escritura no atómica sin lock (`ProjectionStoreJson`), y fallos de gates de lanzamiento documentados como aprobados (`check:artifacts`, `docs:check`). |
| **MEDIA** | **8** | Brechas funcionales acotadas (fallo de `check-typescript-hygiene.mjs`, claves sintéticas en `WalletToolkit`, stubs que lanzan error en SDK Covenants, falta de rate-limiting en `dev-server`, límites de P2SH ZK ante reutilización, paquetes privados sin tests). |
| **BAJA** | **4** | Deuda de higiene menor (archivo residual `packages/.hardkas/store.db`, normalización de rutas cortas 8.3 en Windows en tests CLI, divergencia histórica de documentación sobre Argon2id vs scrypt, limitaciones de `Requirements-Agent`). |

---

## 2. Detalle de Hallazgos Verificados

### Hallazgos de Severidad ALTA

#### `HAL-01` — Omisión de `assertBroadcastNodeSynced` en `WalletToolkit.verifySpendNetwork`
- **Requisito afectado**: `HK-REQ-054` (`INCUMPLIDO`)
- **Característica ISO/IEC 25010:2023**: Seguridad (*Integridad*) / Fiabilidad (*Tolerancia a fallos*)
- **Paquete y ubicación exacta**: `@hardkas/toolkit` — `packages/toolkit/src/wallet.ts#L435-L441` (documentado también en `docs/status/send-routes-security.md#L69`).
- **Evidencia técnica**:
  Mientras que `sdk.tx.send`, CLI `tx send`, `@hardkas/workflow` y `rescue-v1` invocan tanto `assertBroadcastNodeIdentity` como `assertBroadcastNodeSynced` antes de planificar o transmitir una transacción, `WalletToolkit.verifySpendNetwork` solo invoca `assertBroadcastNodeIdentity`.
- **Riesgo**: Planificar, firmar y transmitir transacciones contra un nodo `kaspad` no sincronizado (`isSynced: false`), utilizando un conjunto UTXO incompleto u obsoleto.
- **Acción correctiva**: Invocar `await assertBroadcastNodeSynced(this.rpcClient)` dentro de `WalletToolkit.verifySpendNetwork` inmediatamente después de `assertBroadcastNodeIdentity`.

#### `HAL-02` — Escritura no atómica y sin bloqueo en `ProjectionStoreJson.setAll`
- **Requisito afectado**: `HK-REQ-056` (`INCUMPLIDO`)
- **Característica ISO/IEC 25010:2023**: Fiabilidad (*Recuperabilidad*) / Seguridad (*Integridad*)
- **Paquete y ubicación exacta**: `@hardkas/query-store` — `packages/query-store/src/projection-store.ts#L35-L40`.
- **Evidencia técnica**:
  `ProjectionStoreJson.setAll` escribe en un archivo temporal de nombre fijo (`${this.filePath}.tmp`) mediante `fs.writeFileSync` seguido de `fs.renameSync`, sin invocar `fsyncSync`, sin sufijo único por proceso (`.pid.random.tmp`), sin reintentos ante errores transitorios `EPERM`/`EACCES` de Windows y sin adquirir el bloqueo jerárquico `LOCK_ORDER.index` (`30`).
- **Riesgo**: Condición de carrera y corrupción del archivo de proyección JSON cuando dos procesos CLI o el `sync-daemon` actualizan simultáneamente la proyección, o truncamiento ante caída abrupta del proceso.
- **Acción correctiva**: Reemplazar la escritura manual en `ProjectionStoreJson.setAll` por `writeFileAtomicSync` protegido bajo el lock `LOCK_ORDER.index`.

#### `HAL-03` — Fallo del Gate de Fixtures Válidos (`pnpm check:artifacts` / Exit Code 1)
- **Requisito afectado**: `HK-REQ-071` (`INCUMPLIDO`)
- **Característica ISO/IEC 25010:2023**: Adecuación Funcional (*Completitud Funcional*) / Mantenibilidad (*Testabilidad*)
- **Paquete y ubicación exacta**: `@hardkas/artifacts`, `scripts/check-artifact-fixtures.mjs#L1-L90`, `packages/artifacts/test/fixtures/valid/` y `docs/status/release-claims.md#L74`.
- **Evidencia técnica**:
  Al ejecutar `node scripts/check-artifact-fixtures.mjs packages/artifacts/test/fixtures/valid`, el script termina con **Exit Code 1**:
  `[check-artifact-fixtures] scanned 0, refused 0 — FAIL - the corpus is empty`.
  El directorio `packages/artifacts/test/fixtures/valid` contiene **0 archivos**, lo que contradice `docs/status/release-claims.md#L74` donde figura como control superado.
- **Riesgo**: Ausencia de validación de regresión sobre el corpus canónico positivo (`hashVersion: 5`) en el script de gate de artefactos.
- **Acción correctiva**: Poblar `packages/artifacts/test/fixtures/valid/` con al menos un artefacto canónico válido (`hashVersion: 5`) por cada uno de los esquemas registrados en `@hardkas/artifacts` y verificar que `pnpm check:artifacts` devuelva `0`.

#### `HAL-04` — Fallo del Gate de Documentación (`pnpm docs:check` / Exit Code 1) por enlaces rotos y rutas locales
- **Requisito afectado**: `HK-REQ-070` (`INCUMPLIDO`)
- **Característica ISO/IEC 25010:2023**: Mantenibilidad (*Analizabilidad* y *Modificabilidad*)
- **Paquete y ubicación exacta**: `scripts/docs-check.mjs`, `docs/community/rc-0.13.0-rc.1/EVIDENCE_INDEX.md` y `docs/internal/audit/surface-2026-11-09/inventario.md`.
- **Evidencia técnica**:
  La ejecución de `node scripts/docs-check.mjs` devuelve **Exit Code 1** al detectar **4 enlaces rotos**:
  1. `docs/community/rc-0.13.0-rc.1/EVIDENCE_INDEX.md` -> `X_POST.md` (no existe).
  2. `docs/community/rc-0.13.0-rc.1/EVIDENCE_INDEX.md` -> `DISCORD_ANNOUNCEMENT.md` (no existe).
  3. `docs/internal/audit/surface-2026-11-09/inventario.md` -> ruta absoluta local `C:\Users\jrodr\hkl1\rc2\...` (2 ocurrencias).
  Esto contradice `docs/status/release-claims.md#L79`.
- **Acción correctiva**: Corregir o eliminar los 2 enlaces faltantes en `EVIDENCE_INDEX.md` y convertir las 2 rutas absolutas `C:\Users\jrodr\...` en rutas relativas dentro del repositorio.

---

### Hallazgos de Severidad MEDIA

#### `HAL-05` — Fallo del Gate de Higiene TypeScript (`scripts/check-typescript-hygiene.mjs` / Exit Code 1)
- **Requisito afectado**: `HK-REQ-069` (`INCUMPLIDO`)
- **Característica ISO/IEC 25010:2023**: Mantenibilidad (*Analizabilidad* / *Modificabilidad*)
- **Ubicación**: `scripts/check-typescript-hygiene.mjs#L1-L90` (afecta a `accounts`, `artifacts`, `cli`, `sdk`, `simulator`, `testing`, `toolkit`, `tx-builder`).
- **Evidencia técnica**: El script termina con **Exit Code 1**, reportando **2.448 ocurrencias de `any`** y más de 100 bloques `catch (e: any)` no migrados a `catch (e: unknown)`, contradiciendo `docs/status/release-claims.md#L82`.

#### `HAL-06` — Identidad sintética derivada del nombre y métodos stub en `WalletToolkit`
- **Requisito afectado**: `HK-REQ-055` (`INCUMPLIDO`), mitigado parcialmente por `HK-REQ-051` (`VERIFICADO`)
- **Característica ISO/IEC 25010:2023**: Seguridad (*Autenticidad*) / Adecuación Funcional
- **Ubicación**: `packages/toolkit/src/wallet.ts#L156-L201`, `#L362-L373`.
- **Evidencia técnica**: `WalletToolkit` deriva claves deterministas a partir del nombre de la billetera (bloqueado fuera de `simnet` mediante `WALLET_SYNTHETIC_NETWORK_BLOCKED`), `planSend()` lanza un error de método obsoleto y `sendSimulated()` devuelve un identificador ficticio sin ejecutar el simulador real.

#### `HAL-07` — Métodos públicos obsoletos `planDeploy` y `planSpend` en `HardkasCovenants` lanzan error en tiempo de ejecución
- **Requisito afectado**: `HK-REQ-045` (`INCUMPLIDO`)
- **Característica ISO/IEC 25010:2023**: Adecuación Funcional (*Corrección Funcional*)
- **Ubicación**: `packages/sdk/src/covenants.ts#L494-L516`.
- **Evidencia técnica**: Ambos métodos permanecen expuestos en la clase pública `HardkasCovenants` pero lanzan incondicionalmente `COVENANT_PLAN_UNSUPPORTED`.

#### `HAL-08` — Ausencia de Rate Limiting en `/api/*` de `@hardkas/dev-server`
- **Requisito afectado**: `HK-REQ-067` (`INCUMPLIDO`)
- **Característica ISO/IEC 25010:2023**: Eficiencia de Desempeño / Seguridad (*Resistencia a DoS local*)
- **Ubicación**: `packages/dev-server/src/server.ts#L74-L205`.
- **Evidencia técnica**: Aunque `@hardkas/dev-server` exige un token Bearer de 32 bytes y protege contra DNS rebinding y CSRF, carece de limitador de peticiones por IP, lo que deja expuesto el proceso si el desarrollador activa `--unsafe-external`.

#### `HAL-09` — Brechas de protocolo fail-closed (`lockTime != 0`, gasto ECDSA P2PK y `storageMass: 0` en artefactos V0)
- **Requisitos afectados**: `HK-REQ-023` (`INCUMPLIDO`), `HK-REQ-024` (`INCUMPLIDO`), `HK-REQ-034` (`PARCIAL`)
- **Característica ISO/IEC 25010:2023**: Adecuación Funcional / Compatibilidad (*Interoperabilidad*)
- **Ubicación**: `packages/tx-builder/src/builder.ts#L1-L260`, `packages/accounts/src/signer.ts#L1-L180`, `docs/status/limitations.md#L74-L115`.
- **Evidencia técnica**: El constructor de transacciones rechaza de forma segura `lockTime` distinto de cero (`LOCK_TIME_NOT_SUPPORTED`) y entradas ECDSA P2PK (`ECDSA_SPEND_NOT_SUPPORTED`), y los artefactos firmados V0 registran `storageMass: 0` mientras el nodo `kaspad` recalcula la masa KIP-9 al aceptar en mempool.

#### `HAL-10` — Riesgo de repetición de testigo ZK en P2SH L1 si se reutiliza la misma dirección con idéntico importe
- **Requisito afectado**: `HK-REQ-046` (`PARCIAL`)
- **Característica ISO/IEC 25010:2023**: Seguridad (*No repudio / Integridad criptográfica L1*)
- **Ubicación**: `packages/sdk/src/zk/toccata.ts#L248-L280`, `#L979-L985` y `docs/status/limitations.md#L140-L147`.
- **Evidencia técnica**: Debido a que un script P2SH en Kaspa L1 no puede comprometer su propio outpoint de entrada (`ZK_UTXO_BINDING_UNSATISFIABLE`), financiar dos veces la misma dirección P2SH ZK `proof-and-output-bound` con el mismo monto permite reutilizar el testigo salvo que se envuelva en un covenant con estado Toccata V1.

#### `HAL-11` — Desbordamiento de trama WebSocket (`100 MiB`) en `kaspad` ante acumulación masiva de UTXOs en `localnet`
- **Requisito afectado**: `HK-REQ-036` (`PARCIAL`)
- **Característica ISO/IEC 25010:2023**: Eficiencia de Desempeño (*Capacidad*) / Fiabilidad
- **Ubicación**: `docs/status/limitations.md#L365-L395`, `packages/kaspa-rpc/src/client.ts`.
- **Evidencia técnica**: Sesiones prolongadas de minería `simnet` hacia una única dirección superan el límite de trama wRPC de 100 MiB en `getUtxosByAddresses` (`LFU-UTXO-READ-LIMIT`) si no se ejecuta consolidación periódica.

#### `HAL-12` — Cinco paquetes internos privados carecen por completo de pruebas unitarias (`0 tests`) y `@hardkas/client` no soporta el token Bearer de `dev-server`
- **Requisitos afectados**: `HK-REQ-047` (`INCUMPLIDO`), `HK-REQ-058` (`SIN EVIDENCIA`), `HK-REQ-068` (`INCUMPLIDO`)
- **Característica ISO/IEC 25010:2023**: Mantenibilidad (*Testabilidad*) / Compatibilidad
- **Ubicación**: `packages/client`, `packages/storage-postgres`, `packages/storage-sqlite`, `packages/plugin-local-indexer`, `packages/simulator-adapters`, `packages/pskt-native`.
- **Evidencia técnica**: Estos paquetes están correctamente retenidos como `"private": true` fuera de los 22 paquetes publicados, pero carecen de suites de pruebas o presentan incompatibilidades (`@hardkas/client` no envía `Authorization: Bearer <token>`; `@hardkas/pskt-native` usa `rusty-kaspa 2.0.1` solo para `win32-x64` con `index.d.ts` vacío).

---

### Hallazgos de Severidad BAJA

#### `HAL-13` — Archivo SQLite binario residual `packages/.hardkas/store.db` en el árbol de código fuente
- **Ubicación**: `packages/.hardkas/store.db`.
- **Evidencia técnica**: Existe un archivo de base de datos SQLite residual dentro del directorio `packages/.hardkas/`. Debe eliminarse y prevenirse en `.gitignore`.

#### `HAL-14` — 11 tests omitidos (`[known gap]`) y rutas cortas DOS 8.3 (`~`) en Windows en tests de CLI
- **Requisito afectado**: `HK-REQ-072` (`PARCIAL`)
- **Ubicación**: `docs/status/limitations.md#L315-L364`, `scripts/check-known-gaps.mjs`.
- **Evidencia técnica**: Los 11 skips están perfectamente inventariados y auditados por `check-known-gaps.mjs`, incluyendo discrepancias de rutas temporales 8.3 (`RUNNER~1`) en Windows cuando no se normaliza con `fs.realpathSync.native`.

#### `HAL-15` — Divergencia en informes históricos de auditoría interna sobre Argon2id vs `scrypt`
- **Ubicación**: `packages/accounts/src/keystore.ts#L14-L90` frente a notas históricas en `docs/internal/audit/`.
- **Evidencia técnica**: El código de producción real en `packages/accounts/src/keystore.ts` utiliza **Argon2id (`v2.1.0`) + AES-256-GCM + AAD**, que es más robusto que `scrypt`, pero algunos documentos históricos de archivo mencionaban `scrypt`.

#### `HAL-16` — Limitaciones técnicas de `Requirements-Agent` para auditorías directas de monorepos
- **Ubicación**: `req_agent.py` (analizado en Fase 1 y Fase 4).
- **Evidencia técnica**: Modelo `gemini-2.5-flash` retirado (HTTP 404), validación de `GEMINI_API_KEY` en tiempo de importación antes de `argparse`, regex de segmentación incompatible con prefijos `[ID]`, y triaje binario que descarta restricciones arquitectónicas como `NONE` y clasifica controles funcionales de seguridad bajo `Functional Suitability`.
