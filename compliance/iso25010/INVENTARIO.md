# INVENTARIO EXHAUSTIVO DEL MONOREPO HARDKAS (`v0.13.0-rc.2`)

## 1. Resumen Global del Monorepo

| Categoría | Total Detectado | Detalle de Composición |
| :--- | :--- | :--- |
| **Paquetes en `packages/*`** | **35 paquetes** | 21 paquetes con `"private": false` en `packages/*` + manifiesto publicable adicional contabilizado por `check-versions.mjs` (**22 manifiestos publicables MIT** y **14 privados retenidos**) |
| **Código fuente en `packages/*/src`** | **682 archivos** | **675 archivos TypeScript (`.ts`/`.tsx`)** + **7 archivos Rust (`.rs`)** en `@hardkas/pskt-native` |
| **Suites de pruebas (`*.test.ts`)** | **885 archivos** | **874** en `packages/*`, **6** en `labs/*`, **3** en `examples/*`, **2** en `apps/merchant-backend` |
| **Símbolos públicos exportados** | **1.521 símbolos** | **1.422** en los 31 paquetes inventariados en `PUBLIC_API_SURFACE.md` (**500** ejercitados en tests = **35,2 %**) + **99** en 4 paquetes internos |
| **Aplicaciones (`apps/*`)** | **2 aplicaciones** | `apps/docs` (Next.js/Fumadocs, 1.350 archivos) y `apps/merchant-backend` (Fastify/SQLite, 15 archivos) |
| **Builder Labs (`labs/*`)** | **10 directorios** | 9 laboratorios individuales + `labs/showcase-suite` (que anida **9 apps** y **3 paquetes compartidos**) |
| **Ejemplos (`examples/*`)** | **12 proyectos** | 12 ejemplos ejecutables (`01-hello-simulator` a `05-full-workflow`, `counter`, `escrow`, `multisig`, `vault`, etc.) |
| **Benchmarks (`benchmarks/*`)** | **4 suites** | `utxo.bench.ts`, `snapshot.bench.ts`, `jobs.bench.ts`, `docker-long-run.ts` |
| **Fixtures (`fixtures/*` + paquetes)** | **93 archivos** | **54** en `fixtures/toccata-v2/` + **39** en `packages/artifacts/test/fixtures/` (incluyendo 12 corruptos en `corrupted/` y **0** en `valid/`) |
| **Plantillas (`templates/*`)** | **3 plantillas** | `basic/`, `covenant/`, `payment-app/` (8 archivos; duplicadas en `packages/create-hardkas/templates/`) |
| **Infraestructura (`infra/*`)** | **72 archivos** | `infra/verdaccio/` (`docker-compose.yml`, `config.yaml`, 69 tarballs `.tgz` en `storage/`) |
| **Scripts de CI y Gobernanza (`scripts/*`)** | **93 scripts** | Gates de versiones, licencias, tarballs, higiene TS, seguridad SilverScript, query-store, etc. |
| **Workflows CI/CD (`.github/*`)** | **5 archivos** | 4 workflows (`ci.yml`, `nightly-docker.yml`, `release.yml`, `testnet10-qualification.yml`) + 1 composite action |
| **Documentación (`docs/**`)** | **2.259 archivos** | 127 en español/inglés actual + 2.132 en `docs/archive/` |

> [!WARNING]
> **Artefacto residual detectado en el árbol de paquetes**: Existe el archivo SQLite binario `packages/.hardkas/store.db` (`packages/.hardkas/`) dentro del directorio `packages/`. Debe eliminarse e incluirse en `.gitignore`.

---

## 2. Inventario Completo de los 35 Paquetes (`packages/*`)

La arquitectura de HardKAS se estructura en 5 niveles jerárquicos estrictos (**Nivel 0: Foundations**, **Nivel 1: Core Primitives / Execution**, **Nivel 2: Composition / Product API**, **Nivel 3: Extensions**, **Nivel 4: Presentation & Internal Tooling**). Todos los paquetes tienen versión `0.13.0-rc.2`.

| # | Paquete (`@hardkas/*` / CLI) | Directorio | Nivel Arq. | Visibilidad | Archivos `src` | Archivos `test` | Símbolos Exp. (`Ejercitados`) | Dependencias Internas `@hardkas/*` | Propósito Principal |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- |
| 1 | `@hardkas/core` | `packages/core` | Nivel 0 | Publicado | 50 TS | 59 | 269 (`79` / 29,4%) | Ninguna (Raíz N0) | Tipos base, `ExecutionTarget`, bloqueo de mainnet, errores tipados, locks jerárquicos, redacción de secretos, validación de direcciones y sompi. |
| 2 | `@hardkas/config` | `packages/config` | Nivel 0 | Publicado | 9 TS | 25 | 38 (`15` / 39,5%) | `core` | Carga determinista y validación Zod de `hardkas.config.*`, perfiles de red y aislamiento de claves por entorno. |
| 3 | `@hardkas/observability` | `packages/observability` | Nivel 0 | Publicado | 6 TS | 7 | 22 (`11` / 50,0%) | `core` | Logging estructurado JSON, métricas, trazas de ejecución y redacción preventiva de credenciales. |
| 4 | `@hardkas/artifacts` | `packages/artifacts` | Nivel 1 | Publicado | 34 TS | 74 | 164 (`65` / 39,6%) | `core` | Almacén inmutable write-once, canonicalización JSON RFC-8785 (`hashVersion: 5`), esquemas Zod, paquetes de evidencia y derivación pura `deriveTxStatus`. |
| 5 | `@hardkas/accounts` | `packages/accounts` | Nivel 1 | Publicado | 14 TS | 25 | 62 (`26` / 41,9%) | `core` | Gestión de cuentas HD BIP-39/BIP-32, keystores cifrados (Argon2id + AES-256-GCM), aislamiento por red y firmantes Schnorr/WASM. |
| 6 | `@hardkas/tx-builder` | `packages/tx-builder` | Nivel 1 | Publicado | 15 TS | 36 | 56 (`25` / 44,6%) | `core`, `accounts`, `artifacts` | Selección determinista de UTXOs, cálculo iterativo de masa KIP-9 y comisiones, serialización de transacciones y susash Schnorr. |
| 7 | `@hardkas/kaspa-rpc` | `packages/kaspa-rpc` | Nivel 1 | Publicado | 18 TS | 41 | 68 (`29` / 42,6%) | `core` | Cliente JSON-RPC/wRPC para `kaspad`, guardias de identidad de red y sincronización (`assertBroadcastNodeSynced`), reconciliación mempool/DAG y circuit breaker. |
| 8 | `@hardkas/simulator` | `packages/simulator` | Nivel 1 | Publicado | 34 TS | 52 | 95 (`39` / 41,1%) | `core`, `accounts`, `artifacts`, `tx-builder` | Simulador determinista en memoria del BlockDAG de Kaspa, reloj virtual, snapshots, detección de conflictos y verificación de scripts/introspección. |
| 9 | `@hardkas/localnet` | `packages/localnet` | Nivel 1 | Publicado | 30 TS | 48 | 74 (`27` / 36,5%) | `core`, `config`, `kaspa-rpc`, `observability` | Orquestador de nodos `kaspad` locales (binario nativo o Docker), gestión de puertos, génesis simnet, minería bajo demanda y health checks. |
| 10 | `@hardkas/node-runner` | `packages/node-runner` | Nivel 1/3 | Publicado | 11 TS | 14 | 26 (`12` / 46,2%) | `core`, `observability` | Supervisión de procesos de nodo local, descarga verificada por SHA-256 con bloqueos de archivo y rotación de logs. |
| 11 | `@hardkas/workflow` | `packages/workflow` | Nivel 1/2 | Publicado | 12 TS | 19 | 31 (`14` / 45,2%) | `core`, `artifacts`, `accounts`, `tx-builder`, `kaspa-rpc`, `simulator` | Motor transaccional core-adjacent para ejecución reproducible de escenarios (`plan -> sign -> broadcast -> confirm -> receipt`). |
| 12 | `@hardkas/sdk` | `packages/sdk` | Nivel 2 | Publicado | 120 TS | 206 | 177 (`64` / 36,2%) | `core`, `config`, `observability`, `artifacts`, `accounts`, `tx-builder`, `kaspa-rpc`, `simulator`, `localnet`, `workflow`, `query`, `query-store` | Superficie principal de composición para desarrolladores (`HardkasClient`), pagos, waiters con retroceso DAG, SilverScript, Toccata V1 y verificador ZK Groth16. |
| 13 | `@hardkas/query` | `packages/query` | Nivel 3 | Publicado | 10 TS | 15 | 29 (`13` / 44,8%) | `core`, `artifacts`, `kaspa-rpc` | Consultas unificadas y paginadas sobre UTXOs, balances, historial de transacciones y estado del DAG. |
| 14 | `@hardkas/query-store` | `packages/query-store` | Nivel 3 | Publicado | 26 TS | 38 | 49 (`20` / 40,8%) | `core`, `artifacts`, `query` | Proyección SQLite de solo lectura reconstruible (`sync`, `doctor`, `rebuild`) sobre los artefactos del sistema de archivos. |
| 15 | `@hardkas/toolkit` | `packages/toolkit` | Nivel 3 | Publicado | 33 TS | 35 | 78 (`21` / 26,9%) | `core`, `accounts`, `artifacts`, `tx-builder`, `kaspa-rpc`, `simulator`, `jobs` | Utilidades de alto nivel para aplicaciones: coin control (50k UTXOs), consolidación, pagos por lotes, facturación (`InvoiceManager`), snapshots y `WalletToolkit`. |
| 16 | `@hardkas/jobs` | `packages/jobs` | Nivel 3 | Publicado | 10 TS | 10 | 24 (`9` / 37,5%) | `core`, `artifacts`, `observability` | Cola de trabajos asíncronos con persistencia de checkpoints, reintentos con backoff y seguimiento de progreso. |
| 17 | `@hardkas/escrow` | `packages/escrow` | Nivel 3 | Publicado | 8 TS | 9 | 18 (`8` / 44,4%) | `core`, `accounts`, `artifacts`, `tx-builder`, `sdk` | Contratos SilverScript de custodia 2-de-3 multisig y resolución de disputas con timeout (`rescue-v1` con tope de comisión de 500.000 sompi). |
| 18 | `@hardkas/bridge-local` | `packages/bridge-local` | Nivel 3 | Publicado | 7 TS | 5 | 14 (`6` / 42,9%) | `core`, `artifacts` | Serialización de payloads de entrada L1->L2 y simulación determinista de minería de prefijos para laboratorios de puentes locales. |
| 19 | `@hardkas/testing` | `packages/testing` | Nivel 3 | Publicado | 14 TS | 10 | 32 (`11` / 34,4%) | `core`, `artifacts`, `simulator`, `sdk` | Arnés de pruebas deterministas, aserciones personalizadas, generadores de fixtures y utilidades de aislamiento hermético. |
| 20 | `@hardkas/cli` | `packages/cli` | Nivel 4 | Publicado | 108 TS | 115 | 38 (`5` / 13,2%) | `core`, `config`, `observability`, `artifacts`, `accounts`, `tx-builder`, `kaspa-rpc`, `simulator`, `localnet`, `node-runner`, `sdk`, `query`, `query-store`, `toolkit`, `jobs`, `escrow`, `bridge-local`, `dev-server` | Interfaz de línea de comandos `hardkas` con etiquetado de madurez por comando, salida `--json`, doctor, evidence, rescue-v1 y gestor de extensiones. |
| 21 | `create-hardkas` | `packages/create-hardkas` | Nivel 4 | Publicado | 3 TS | 3 | 2 (`2` / 100%) | Ninguna (scaffolder autónomo) | Generador interactivo/CLI (`npx create-hardkas`) para inicializar proyectos desde `basic`, `covenant` o `payment-app`. |
| 22 | `@hardkas/dev-server` | `packages/dev-server` | Nivel 4 | **Privado** | 12 TS | 12 | 11 (`0` / 0,0%) | `core`, `config`, `artifacts`, `accounts`, `simulator`, `localnet`, `sdk`, `query-store` | Servidor HTTP local (`127.0.0.1`) de inspección y desarrollo con protección DNS rebinding, CORS, token Bearer de 32 bytes y cabecera CSRF. |
| 23 | `@hardkas/l2` | `packages/l2` | Nivel 3 | **Privado** | 18 TS | 7 | 21 (`0` / 0,0%) | `core`, `config`, `artifacts`, `observability` | Adaptador experimental para redes L2 compatibles con EVM (Igra Labs) con bloqueo estricto de Igra Mainnet (`chainId: 38833`). |
| 24 | `@hardkas/ext-l2` | `packages/ext-l2` | Nivel 4 | **Privado** | 6 TS | 4 | 4 (`0` / 0,0%) | `core`, `l2` | Extensión CLI experimental para comandos L2 (`hardkas l2 ...`), instalable únicamente vía tarball local con `--sha256`. |
| 25 | `@hardkas/pskt-native` | `packages/pskt-native` | Nivel 1 | **Privado** | 1 TS + 7 RS | 2 | 0 (`index.d.ts` vacío) | Ninguna (N-API Rust `rusty-kaspa 2.0.1`) | Addon nativo N-API en Rust para PSKT (retenido en privado por desajuste `rusty-kaspa 2.0.1` vs `2.1.0` y soporte exclusivo `win32-x64`). |
| 26 | `@hardkas/client` | `packages/client` | Nivel 4 | **Privado** | 4 TS | **0** | 5 (`0` / 0,0%) | `core` | Cliente HTTP ligero para `@hardkas/dev-server` (retenido en privado: carece de soporte para enviar el token Bearer y tiene 0 tests). |
| 27 | `@hardkas/react` | `packages/react` | Nivel 4 | **Privado** | 6 TS | 1 | 7 (`0` / 0,0%) | `core`, `client` | Hooks y proveedor React para aplicaciones Kaspa locales (retenido en privado por depender de `@hardkas/client` y baja cobertura). |
| 28 | `@hardkas/wallet-adapter` | `packages/wallet-adapter` | Nivel 3 | **Privado** | 7 TS | 1 | 8 (`0` / 0,0%) | `core`, `accounts` | Interfaz de adaptación para billeteras externas (retenido en privado hasta validación con billeteras reales). |
| 29 | `@hardkas/plugin-rpc-backend` | `packages/plugin-rpc-backend` | Nivel 3 | **Privado** | 6 TS | 1 | 9 (`0` / 0,0%) | `core`, `kaspa-rpc` | Plugin de resiliencia RPC (retenido en privado: falta pool de conexiones, reconexión automática WS y jitter aleatorio). |
| 30 | `@hardkas/plugin-local-indexer` | `packages/plugin-local-indexer` | Nivel 3 | **Privado** | 5 TS | **0** | 8 (`0` / 0,0%) | `core`, `artifacts`, `query-store` | Plugin de indexación local de eventos y UTXOs (retenido en privado; 0 archivos de test). |
| 31 | `@hardkas/simulator-adapters` | `packages/simulator-adapters` | Nivel 3 | **Privado** | 5 TS | **0** | 5 (`0` / 0,0%) | `core`, `simulator` | Adaptadores de persistencia y transporte para el simulador (retenido en privado; 0 archivos de test). |
| 32 | `@hardkas/storage-postgres` | `packages/storage-postgres` | Nivel 3 | **Privado** | 6 TS | **0** | 12 (`0` / 0,0%) | `core`, `artifacts` | Backend PostgreSQL experimental para indexación y artefactos (no listado en `PUBLIC_API_SURFACE.md`; 0 tests). |
| 33 | `@hardkas/storage-sqlite` | `packages/storage-sqlite` | Nivel 3 | **Privado** | 6 TS | **0** | 14 (`0` / 0,0%) | `core`, `artifacts` | Backend SQLite experimental para almacenamiento estructurado (no listado en `PUBLIC_API_SURFACE.md`; 0 tests). |
| 34 | `@hardkas/sync-daemon` | `packages/sync-daemon` | Nivel 3 | **Privado** | 8 TS | 1 | 19 (`0` / 0,0%) | `core`, `kaspa-rpc`, `query-store`, `observability` | Demonio de sincronización continua nodo-a-store (no listado en `PUBLIC_API_SURFACE.md`; 1 test). |
| 35 | `@hardkas/testnet-qualification` | `packages/testnet-qualification` | Nivel 4 | **Privado** | 19 TS | 5 | 54 (`0` / 0,0%) | `core`, `accounts`, `artifacts`, `kaspa-rpc`, `sdk` | Runner interno de calificación contra Testnet-10 con reserva fail-closed de UTXOs, redacción de secretos y prohibición de faucets públicos. |

---

## 3. Inventario de Aplicaciones (`apps/*`), Laboratorios (`labs/*`) y Ejemplos (`examples/*`)

### 3.1 Aplicaciones (`apps/*`)
1. **`apps/docs` (`v0.1.0`, privado)**: Portal de documentación basado en Next.js 15 y Fumadocs con **1.350 archivos** (guías, referencia de CLI/SDK, arquitectura y tutoriales).
2. **`apps/merchant-backend` (`v0.13.0-rc.2`, privado)**: Servicio backend de cobros para comercios construido con Fastify y SQLite (**15 archivos**, incluyendo **2 suites de pruebas**), que valida la creación de facturas, detección de pagos en el DAG y emisión de recibos verificables.

### 3.2 Builder Labs (`labs/*` — 10 directorios)
1. **`labs/batch-engine`**: Motor de pagos masivos y división automática de lotes UTXO.
2. **`labs/custody-service`**: Servicio de custodia multi-firma con políticas de aprobación y auditoría de artefactos.
3. **`labs/explorer`**: Explorador local de bloques, transacciones y linaje de artefactos.
4. **`labs/full-stack-demo`**: Demostración integrada de extremo a extremo (backend + indexador + cliente).
5. **`labs/local-indexer`**: Indexador local determinista de UTXOs y eventos del DAG.
6. **`labs/merchant-checkout`**: Flujo completo de pasarela de pago comercial con confirmación determinista.
7. **`labs/oracle-service`**: Oráculo local firmante de datos con atestación criptográfica.
8. **`labs/payment-service`**: Procesador de pagos con colas de trabajos (`@hardkas/jobs`) y reconciliación.
9. **`labs/testnet-runner`**: Arnés aislado de calificación en vivo sobre Testnet-10 (**6 archivos de test**, incluyendo `no-public-funding.test.ts`).
10. **`labs/showcase-suite`**: Monorepo de validación compuesto por **9 aplicaciones** (`apps/batch-treasury`, `apps/commerce-checkout`, `apps/covenant-Escrow-desk`, `apps/custody-ops`, `apps/dag-explorer`, `apps/indexer-console`, `apps/oracle-desk`, `apps/payment-hub`, `apps/wallet-ops`) y **3 paquetes compartidos** (`packages/lab-core`, `packages/lab-ui`, `packages/scenario-kit`).

### 3.3 Ejemplos (`examples/*` — 12 directorios)
- `01-hello-simulator`, `02-payment-flow`, `03-utxo-consolidation`, `04-scenario-evidence`, `05-full-workflow`, `counter`, `covenant-vault`, `escrow`, `merchant-pos`, `multisig`, `silver-counter`, `vault` (con **3 archivos de test** integrados).

---

## 4. Configuración de Pruebas, Benchmarks, Infraestructura y CI/CD

### 4.1 Configuraciones de Pruebas (9 archivos `vitest*.config.ts`)
- `vitest.config.ts` (configuración global por defecto)
- `vitest.unit.config.ts` (pruebas unitarias puras de alta velocidad)
- `vitest.integration.config.ts` (integración entre paquetes y artefactos)
- `vitest.e2e.config.ts` (flujos de extremo a extremo de CLI y SDK)
- `vitest.hermetic.config.ts` (aislamiento total de red mediante `scripts/hermetic/no-network-preload.cjs` y `HARDKAS_HOME` efímero)
- `vitest.Docker.config.ts` (pruebas con contenedores `kaspad` reales)
- `vitest.examples.config.ts` (validación de ejemplos)
- `vitest.labs.config.ts` (validación de Builder Labs)
- `vitest.testnet10.config.ts` (calificación controlada en Testnet-10)

### 4.2 Suites de Benchmarks (`benchmarks/*`)
1. `benchmarks/utxo.bench.ts`: Indexación, filtrado por dirección y selección greedy/óptima de monedas con **1.000, 10.000 y 50.000 UTXOs**.
2. `benchmarks/snapshot.bench.ts`: Captura y restauración de snapshots deterministas de estado en el simulador y toolkit.
3. `benchmarks/jobs.bench.ts`: Encolado y ejecución concurrente de **100, 1.000 y 10.000 trabajos** en `@hardkas/jobs`.
4. `benchmarks/docker-long-run.ts`: Prueba de estabilidad y fugas de memoria en ejecución prolongada contra nodo Docker.

### 4.3 Workflows de GitHub Actions (`.github/workflows/*`)
1. `ci.yml`: Pipeline principal de compilación, verificación de versiones, licencias, higiene, pruebas unitarias/herméticas y empaquetado de tarballs.
2. `nightly-docker.yml`: Ejecución nocturna contra nodos `kaspad` reales en Docker.
3. `release.yml`: Publicación controlada de los 22 paquetes MIT aprobados tras superar los gates de integridad.
4. `testnet10-qualification.yml`: Calificación manual/programada contra Kaspa Testnet-10.
5. `.github/actions/setup-hardkas/action.yml`: Acción compuesta para aprovisionar Node 22, `pnpm@9.0.0` y caché del workspace.
