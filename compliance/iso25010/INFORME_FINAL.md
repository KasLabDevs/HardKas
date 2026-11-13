# INFORME FINAL DE AUDITORÍA INTEGRAL ISO/IEC 25010:2023 (`INFORME_FINAL.md`)

**Proyecto Auditado**: HardKAS Monorepo (`https://github.com/KasLabDevs/HardKas`)  
**Versión Auditada**: `0.13.0-rc.2`  
**Estándar de Referencia**: ISO/IEC 25010:2023 (*Systems and software Quality Requirements and Evaluation — Product quality model*)  
**Agente de Ingeniería de Requisitos**: `Requirements-Agent` (`https://github.com/mhabibullah-dev/Requirements-Agent`, ejecutado en entorno aislado Python 3.14 sobre 6 lotes con trazabilidad completa)

---

## Resumen Ejecutivo y Puntuación Global

Se ha auditado la totalidad del monorepo **HardKAS (`v0.13.0-rc.2`)**, abarcando **35 paquetes** en `packages/*` (**22 manifiestos publicables MIT** y **14 privados retenidos**), **682 archivos de código fuente** (**675 TS** + **7 Rust**), **885 archivos de prueba (`.test.ts`)** en **9 configuraciones Vitest**, **2 aplicaciones** (`apps/docs`, `apps/merchant-backend`), **10 directorios de Builder Labs** (incluyendo las 9 aplicaciones de `showcase-suite`), **12 ejemplos**, **4 suites de benchmarks**, **93 scripts de automatización y gates** y **2.259 documentos**.

A partir del código real, contratos, pruebas y documentación normativa se extrajeron **72 requisitos trazables (`HK-REQ-001` a `HK-REQ-072`)**, procesados íntegramente por el pipeline real de **`Requirements-Agent`** y contrastados con la implementación y con la ejecución en vivo de **11 scripts de control (gates)**:

- **Cumplimiento sobre la línea base implementada (`35 Explícitos + 16 Inferidos = 51 requisitos`)**: **100,00 % (`51/51 VERIFICADO`)**.
- **Cumplimiento global ponderado ISO/IEC 25010:2023 sobre los 72 requisitos (incluyendo los `21 Recomendados` y brechas)**: **76,39 %** (`51 VERIFICADO`, `8 PARCIAL`, `12 INCUMPLIDO`, `1 SIN EVIDENCIA`).

---

## Respuesta Detallada a las 8 Preguntas Mandatorias (Fase 8)

### 1. ¿Qué partes de HardKAS cumplen los requisitos de calidad evaluados?

Cumplen de forma **sobresaliente y verificable (`VERIFICADO` al 100 %)** los núcleos fundacionales, criptográficos, de artefactos y de ejecución determinista:

1. **Nivel 0 — Fundamentos (`@hardkas/core`, `@hardkas/config`, `@hardkas/observability`)**:
   - **Bloqueo total de Mainnet en código (`HK-REQ-001`)**: `MAINNET_CONNECTIONS_ENABLED = false` y `MAINNET_TRANSACTIONS_ENABLED = false` en `packages/core/src/mainnet-policy.ts#L34-L40`, infranqueables por flags o variables de entorno.
   - **Separación de mundos de ejecución (`HK-REQ-002`)**: Resolución obligatoria de `ExecutionTarget` antes de cualquier operación (`packages/core/src/semantics/execution-guard.ts#L76-L218`), bloqueando `SIM_TO_REAL_LEAK` y `REAL_TO_SIM_POLLUTION`.
   - **Fronteras WASM y Redacción (`HK-REQ-003`, `006`, `007`)**: Límites de 1 MB por string, 10 MB por buffer, profundidad JSON $\le 32$, rechazo de `__proto__` (`packages/core/src/wasm-boundary.ts`), validación Bech32m y `MAX_SOMPI`, y redacción automática de claves privadas, semillas BIP-39 y credenciales URL (`packages/core/src/redaction.ts`).
   - **Jerarquía de Locks (`HK-REQ-005`)**: Orden estricto `keystore (10) < artifact (20) < index (30) < config (40)` con prevención de deadlocks y limpieza de locks huérfanos (`packages/core/src/locks.ts`).
2. **Nivel 1 — Artefactos, Cuentas, Constructor de Transacciones, RPC y Simulador (`@hardkas/artifacts`, `@hardkas/accounts`, `@hardkas/tx-builder`, `@hardkas/kaspa-rpc`, `@hardkas/simulator`, `@hardkas/localnet`, `@hardkas/node-runner`)**:
   - **Keystores Criptográficos (`HK-REQ-018`–`020`)**: Cifrado autenticado **Argon2id** ($\ge 19.456\text{ KiB}$, $\ge 2$ iteraciones) + **AES-256-GCM** con AAD (`hardkas.keystore.aad.v1`), permisos `0o600`, escritura atómica con `fsyncSync` y borrado explícito `derivedKey.fill(0)` en bloques `finally` (`packages/accounts/src/keystore.ts#L14-L314`).
   - **Canonicalización RFC-8785 (`hashVersion: 5`) y Derivación Pura (`HK-REQ-013`–`017`)**: Almacén write-once (`ARTIFACT_IDENTITY_CONFLICT`), confinamiento contra path traversal y symlinks, rechazo del **100 % (12/12)** de las fixtures corruptas (`check-artifact-fixtures.mjs --reject` -> **PASS**) y máquina de estados pura `deriveTxStatus` (`packages/artifacts/src/tx-status.ts`).
   - **Guardias RPC y Reconciliación Mempool/DAG (`HK-REQ-029`, `030`)**: `assertBroadcastNodeIdentity` + `assertBroadcastNodeSynced` en SDK y CLI, y filtrado de entradas gastadas en mempool en `RpcUtxoProvider`.
3. **Nivel 2 — SDK, Covenants Toccata V1, SilverScript y ZK Groth16 (`@hardkas/sdk`, `@hardkas/workflow`)**:
   - **Compilador SilverScript Seguro (`HK-REQ-038`)**: Verificado por `check-silver-no-shell-exec.mjs` (`SILVERSCRIPT_SECURITY_SCAN_PASSED`) con tope de 64 KiB.
   - **Verificador Groth16 y Toccata RISC Zero (`HK-REQ-040`, `041`)**: Validación de cuerpo primo BN254, pertenencia a curva $G_1/G_2$, subgrupo de orden primo en $G_2$, heurísticas anti-trapdoor en VK, anclaje de huella SHA-256 de VK, aislamiento en subproceso (`MAX_CONCURRENT_PAIRINGS = 4`, timeout 15 s) y vinculación de salidas L1 mediante opcodes de introspección (`OpTxOutputCount`, `OpTxOutputSpk`, `OpTxOutputAmount`, `OpTxInputCount == 1`).
4. **Endurecimiento de `@hardkas/dev-server` y Gates de Cadena de Suministro (`HK-REQ-062`–`066`)**:
   - Loopback `127.0.0.1`, anti-DNS rebinding, CORS restringido, token Bearer de 32 bytes, cabecera CSRF `X-Hardkas-Request: true`, `DEV_AUTOSIGN_NOT_ALLOWED` por defecto, gate de versiones (**PASS** sobre 6.268 archivos) y gate de licencias (**PASS**, 0 dependencias copyleft requeridas).

---

### 2. ¿Qué partes presentan incumplimientos demostrables?

Se han demostrado empíricamente **12 requisitos en estado `INCUMPLIDO`** (y **3 scripts de gate que fallan con `Exit Code 1`**):

1. **`WalletToolkit.verifySpendNetwork` omite `assertBroadcastNodeSynced` (`HK-REQ-054` — `INCUMPLIDO`)**: En `packages/toolkit/src/wallet.ts#L435-L441`, solo verifica la identidad de red pero no comprueba que el nodo `kaspad` esté sincronizado (`isSynced: true`) antes de planificar y transmitir.
2. **`ProjectionStoreJson.setAll` realiza escrituras no atómicas y sin lock (`HK-REQ-056` — `INCUMPLIDO`)**: En `packages/query-store/src/projection-store.ts#L35-L40`, escribe en un nombre temporal fijo `${this.filePath}.tmp` sin `writeFileAtomicSync`, sin `fsyncSync`, sin reintentos `EPERM` en Windows y sin adquirir `LOCK_ORDER.index`.
3. **Fallo del Gate `pnpm check:artifacts` (`HK-REQ-071` — `INCUMPLIDO`, Exit Code 1)**: `node scripts/check-artifact-fixtures.mjs packages/artifacts/test/fixtures/valid` falla con `scanned 0, refused 0 — FAIL - the corpus is empty` porque el directorio `valid/` tiene 0 archivos, contradiciendo `docs/status/release-claims.md#L74`.
4. **Fallo del Gate `pnpm docs:check` (`HK-REQ-070` — `INCUMPLIDO`, Exit Code 1)**: `node scripts/docs-check.mjs` falla por **4 enlaces rotos** (`X_POST.md` y `DISCORD_ANNOUNCEMENT.md` en `docs/community/rc-0.13.0-rc.1/EVIDENCE_INDEX.md`, y 2 rutas absolutas locales `C:\Users\jrodr\hkl1\rc2\...` en `docs/internal/audit/surface-2026-11-09/inventario.md`), contradiciendo `docs/status/release-claims.md#L79`.
5. **Fallo del Gate `scripts/check-typescript-hygiene.mjs` (`HK-REQ-069` — `INCUMPLIDO`, Exit Code 1)**: Detecta **2.448 ocurrencias de `any`** y más de 100 bloques `catch (e: any)` sin migrar a `catch (e: unknown)`, contradiciendo `docs/status/release-claims.md#L82`.
6. **Identidad sintética y stubs en `WalletToolkit` (`HK-REQ-055` — `INCUMPLIDO`)**: Deriva claves a partir del nombre de la billetera y mantiene los stubs obsoletos `planSend()` (lanza excepción) y `sendSimulated()` (devuelve ID ficticio) en `packages/toolkit/src/wallet.ts#L362-L373`.
7. **Stubs públicos en `HardkasCovenants` (`HK-REQ-045` — `INCUMPLIDO`)**: `planDeploy` y `planSpend` (`packages/sdk/src/covenants.ts#L494-L516`) lanzan `COVENANT_PLAN_UNSUPPORTED`.
8. **Ausencia de Rate Limiting en `@hardkas/dev-server` (`HK-REQ-067` — `INCUMPLIDO`)**: Sin límite de peticiones por IP en `/api/*`.
9. **Incompatibilidad de `@hardkas/client` con el token Bearer de `dev-server` (`HK-REQ-068` — `INCUMPLIDO`)**: No puede enviar `Authorization: Bearer <token>` ni tiene tests.
10. **Desfase de `@hardkas/pskt-native` (`HK-REQ-047` — `INCUMPLIDO`)**: Compilado contra `rusty-kaspa 2.0.1` solo para `win32-x64`, con `index.d.ts` vacío.
11. **Brechas fail-closed del constructor/firmante (`HK-REQ-023`, `HK-REQ-024` — `INCUMPLIDO`)**: `lockTime != 0` (`LOCK_TIME_NOT_SUPPORTED`) y gasto ECDSA P2PK (`ECDSA_SPEND_NOT_SUPPORTED`).

---

### 3. ¿Qué paquetes requieren más atención?

En orden de prioridad técnica:
1. **`@hardkas/toolkit` (Publicado)**: Requiere añadir `assertBroadcastNodeSynced` en `verifySpendNetwork` (`packages/toolkit/src/wallet.ts#L435-L441`) y migrar `WalletToolkit` desde claves sintéticas hacia `@hardkas/accounts`.
2. **`@hardkas/query-store` (Publicado)**: Requiere reemplazar la escritura directa en `ProjectionStoreJson.setAll` (`packages/query-store/src/projection-store.ts#L35-L40`) por `writeFileAtomicSync` bajo `LOCK_ORDER.index`.
3. **`@hardkas/artifacts` (Publicado)**: Requiere poblar `packages/artifacts/test/fixtures/valid/` con artefactos `hashVersion: 5` para restablecer el gate `pnpm check:artifacts`.
4. **`@hardkas/sdk` (Publicado)**: Requiere limpiar los métodos obsoletos `HardkasCovenants.planDeploy`/`planSpend`, migrar los bloques `catch (e: any)` y reforzar las guardias contra reutilización de direcciones P2SH ZK sin estado.
5. **`@hardkas/dev-server`, `@hardkas/client` y `@hardkas/react` (Privados)**: `@hardkas/dev-server` necesita rate limiting en `/api/*`; `@hardkas/client` necesita soporte de token Bearer y tests unitarios antes de poder desbloquear `@hardkas/react`.
6. **Paquetes privados sin tests (`@hardkas/storage-postgres`, `@hardkas/storage-sqlite`, `@hardkas/plugin-local-indexer`, `@hardkas/simulator-adapters`, `@hardkas/pskt-native`)**: Deben permanecer estrictamente privados (`"private": true`) hasta contar con suites de pruebas y alineación de dependencias.

---

### 4. ¿Qué vulnerabilidades o riesgos se han detectado realmente?

- **Vulnerabilidades críticas en Mainnet**: **0** (Mainnet está deshabilitada por constantes inmutables en código tanto en Kaspa L1 como en Igra L2).
- **Riesgos reales detectados**:
  1. **Transmisión a nodo desincronizado vía `WalletToolkit` (Riesgo Alto)**: Por omisión de `assertBroadcastNodeSynced` en `packages/toolkit/src/wallet.ts#L435-L441`.
  2. **Corrupción de proyección JSON por concurrencia o caída de proceso (Riesgo Alto)**: Por no usar escritura atómica ni lock en `ProjectionStoreJson.setAll` (`packages/query-store/src/projection-store.ts#L35-L40`).
  3. **Reproducción (Replay) de testigo ZK en P2SH L1 ante reutilización de dirección con idéntico importe (Riesgo Medio)**: Derivado de la imposibilidad en Kaspa L1 de que un P2SH comprometa su propio outpoint (`ZK_UTXO_BINDING_UNSATISFIABLE`), lo que exige composición con un covenant Toccata V1 con estado.
  4. **Denegación de servicio local por desbordamiento de trama WebSocket de 100 MiB (`LFU-UTXO-READ-LIMIT`, Riesgo Medio)**: Cuando una dirección de minería `localnet` acumula cientos de miles de UTXOs sin consolidar.
  5. **Fuerza bruta o inundación de peticiones en `@hardkas/dev-server` con `--unsafe-external` (Riesgo Medio/Bajo)**: Por ausencia de rate limiting por IP en `/api/*`.

---

### 5. ¿Qué evidencia falta?

1. **Corpus de fixtures válidos en `packages/artifacts/test/fixtures/valid/` (`HK-REQ-071`)**: Actualmente tiene **0 archivos**.
2. **Pruebas unitarias en 5 paquetes internos (`HK-REQ-058` — `SIN EVIDENCIA`)**: `@hardkas/client`, `@hardkas/storage-postgres`, `@hardkas/storage-sqlite`, `@hardkas/plugin-local-indexer` y `@hardkas/simulator-adapters` tienen **0 archivos `.test.ts`**.
3. **Certificación en vivo sobre Testnet-10 para topologías de pactos multi-entrada ($N:M$) (`HK-REQ-048`)**: La evidencia actual de nodo real para pactos cubre transiciones 1:1 en `localnet` y flujos acotados en `testnet-qualification`.
4. **Cobertura directa por nombre de los símbolos públicos restantes (`HK-REQ-072`)**: `PUBLIC_API_SURFACE.md` registra mención directa en tests para **500 de los 1.422 símbolos exportados (35,2 %)**, y omite inventariar 4 paquetes internos (`storage-postgres`, `storage-sqlite`, `sync-daemon`, `testnet-qualification`).

---

### 6. ¿Qué requisitos deben formalizarse?

Deben promoverse de **Recomendados (`Recommended`)** a **Requisitos Normativos Explícitos** los **21 requisitos `HK-REQ-*`** identificados en la Fase 3, especialmente:
- **`HK-REQ-054`**: Obligatoriedad de `assertBroadcastNodeIdentity` + `assertBroadcastNodeSynced` en **todas** las rutas de envío del monorepo sin excepción (incluyendo `@hardkas/toolkit`).
- **`HK-REQ-056`**: Obligatoriedad de `writeFileAtomicSync` (`fsyncSync` + sufijo único + retry Windows) y lock jerárquico `LOCK_ORDER` en **todo** componente que persista JSON en disco (incluyendo `@hardkas/query-store`).
- **`HK-REQ-067`**: Límite de tasa ($\le 60\text{ req/min}$ por IP) en endpoints HTTP de `@hardkas/dev-server`.
- **`HK-REQ-069`, `HK-REQ-070`, `HK-REQ-071`**: Inclusión bloqueante en CI de `check-typescript-hygiene.mjs`, `docs-check.mjs` y `check-artifact-fixtures.mjs valid` con salida `0` obligatoria antes de etiquetar una versión RC o final.
- **`HK-REQ-058`**: Umbral mínimo de pruebas unitarias ($\ge 80\,\%$ de cobertura de líneas) como requisito de salida del estado `"private": true` para paquetes de almacenamiento y adaptadores.

---

### 7. ¿Qué acciones debo ejecutar antes de solicitar una evaluación externa?

El detalle completo se encuentra en `PLAN_DE_ACCION.md`. En síntesis:

| Prioridad | Código | Acción Concreta |
| :---: | :---: | :--- |
| **CRÍTICA (Pre-Mainnet)** | `ACC-CRIT-01` | Impedir reutilización de dirección P2SH ZK sin estado o exigir composición con covenant Toccata V1 (`packages/sdk/src/zk/toccata.ts`). |
| **CRÍTICA (Pre-Mainnet)** | `ACC-CRIT-02` | Sustituir claves sintéticas de `WalletToolkit` por keystores HD Argon2id de `@hardkas/accounts` (`packages/toolkit/src/wallet.ts`). |
| **ALTA (Pre-Auditoría)** | `ACC-ALTA-01` | Añadir `await assertBroadcastNodeSynced(this.rpcClient)` en `WalletToolkit.verifySpendNetwork` (`packages/toolkit/src/wallet.ts#L435-L441`). |
| **ALTA (Pre-Auditoría)** | `ACC-ALTA-02` | Usar `writeFileAtomicSync` y `LOCK_ORDER.index` en `ProjectionStoreJson.setAll` (`packages/query-store/src/projection-store.ts#L35-L40`). |
| **ALTA (Pre-Auditoría)** | `ACC-ALTA-03` | Poblar `packages/artifacts/test/fixtures/valid/` con fixtures `hashVersion: 5` para que `pnpm check:artifacts` devuelva `0`. |
| **ALTA (Pre-Auditoría)** | `ACC-ALTA-04` | Corregir los 4 enlaces rotos en `docs/community/rc-0.13.0-rc.1/EVIDENCE_INDEX.md` y `docs/internal/audit/surface-2026-11-09/inventario.md` para que `pnpm docs:check` devuelva `0`. |
| **MEDIA** | `ACC-MED-01..06` | Corregir `catch (e: any)` (`check-typescript-hygiene.mjs`), eliminar stubs `planDeploy`/`planSpend`, añadir rate limiting en `dev-server`, añadir soporte Bearer en `@hardkas/client` y añadir tests a los paquetes privados. |
| **BAJA** | `ACC-BAJA-01..03` | Eliminar `packages/.hardkas/store.db`, normalizar rutas cortas 8.3 en tests CLI en Windows y completar `PUBLIC_API_SURFACE.md`. |

---

### 8. ¿Qué limitaciones tiene `Requirements-Agent` para este análisis?

Durante la Fase 1 y la Fase 4 se comprobaron empíricamente **6 limitaciones estructurales** en `Requirements-Agent` (`req_agent.py`):

1. **Modelo LLM codificado en duro y retirado (`gemini-2.5-flash`)**: La línea 26 de `req_agent.py` fija `MODEL_NAME = "gemini-2.5-flash"`, el cual devuelve `404 NOT_FOUND` en la API de Gemini para claves actuales. Fue necesario sobrescribir el atributo en memoria desde el orquestador (`batch_runner.py`) con `gemini-3.5-flash-lite` sin modificar `req_agent.py`.
2. **Validación de `GEMINI_API_KEY` en tiempo de importación**: Las líneas 41–47 de `req_agent.py` llaman a `sys.exit(1)` e instancian `genai.Client()` en el ámbito global del módulo **antes** de ejecutar `argparse`, impidiendo incluso invocar `python req_agent.py --help` si no existe la clave.
3. **Bloqueo de 120 segundos por petición en Windows por resolución IPv6 (`httpx2`)**: El SDK `google-genai` subyacente intenta conectar por IPv6 antes de caer a IPv4 en Windows, provocando esperas de 2 minutos por requisito. Se resolvió forzando `socket.AF_INET` en el wrapper de ejecución.
4. **Fragilidad del segmentador regex (`preprocess_text`)**: La expresión regular `re.split(r"(?<=[.!?])\s+(?=[A-Z\"\'(])", text)` solo divide oraciones si el carácter siguiente al espacio es una letra mayúscula, comilla o paréntesis. Si las líneas comienzan con un identificador entre corchetes (`[HK-REQ-001]`), el agente colapsa todo el archivo en un único segmento. Para preservar la trazabilidad 1:1 hubo que redactar cada entrada como `Requirement HK-REQ-XXX states that ...`.
5. **Sesgo del triaje binario (`FR` vs `NFR` vs `NONE`) sobre requisitos de seguridad y arquitectura**:
   - Cuando un control de seguridad o fiabilidad se expresa como una acción concreta del sistema (p. ej. *"bloquear conexiones a mainnet con `MAINNET_CONNECTION_DISABLED`"* o *"verificar `assertBroadcastNodeSynced` antes de transmitir"*), el agente lo clasifica como `Functional Requirement` y le asigna automáticamente la categoría `Functional Suitability` sin evaluar las subcaracterísticas de `Security` o `Reliability`.
   - Asimismo, las restricciones arquitectónicas puras o de alcance de protocolo (`HK-REQ-034`, `HK-REQ-035`, `HK-REQ-048`) son descartadas por el triaje como `NONE` (`Total Discarded (Noise)`), por lo que nuestro consolidador las rescató e incorporó al informe para no perder trazabilidad.
6. **Incapacidad de analizar código fuente directamente**: `Requirements-Agent` solo procesa documentos de texto plano (`.txt` / `.md`) y no inspecciona ASTs, manifiestos `package.json`, suites de tests ni scripts de CI, por lo que requiere obligatoriamente una fase previa de ingeniería inversa del código (Fase 2 y Fase 3) y una fase posterior de verificación empírica contra el repositorio (Fase 5).
