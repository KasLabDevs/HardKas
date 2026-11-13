# MATRIZ DE EVALUACIÓN ISO/IEC 25010:2023 (`MATRIZ_ISO25010.md`)

## 1. Metodología y Fórmula Matemática de Puntuación (Fase 6)

Para evitar puntuaciones subjetivas o certificaciones infundadas, esta matriz define explícitamente el **método matemático de cálculo** empleado sobre el conjunto verificable de **72 requisitos (`HK-REQ-001` a `HK-REQ-072`)** y los **11 controles automatizados (gates)** del monorepo.

### 1.1 Estados Normativos Utilizados
- **`VERIFICADO`** ($w = 1,0$): Requisito implementado íntegramente en el código de producción y respaldado por pruebas o gates que pasan con código de salida `0`.
- **`PARCIAL`** ($w = 0,5$): Requisito implementado con limitaciones conocidas y documentadas (fail-closed) o con cobertura incompleta respecto al alcance objetivo.
- **`INCUMPLIDO`** ($w = 0,0$): Requisito exigible o recomendado que falla en un gate automatizado (`Exit Code 1`), carece de una guardia de seguridad requerida (ej. `assertBroadcastNodeSynced` en `WalletToolkit`, escritura atómica en `ProjectionStoreJson`) o lanza un error de stub no implementado.
- **`SIN EVIDENCIA`** ($w = 0,0$): Componente existente en el repositorio sin suites de pruebas ni evidencia empírica de verificación (`0 archivos de test`).
- **`NO APLICA`** (Excluido del denominador): Subcaracterística ISO no aplicable a un framework local-first de desarrollo y pruebas sin hardware físico ni exposición a mainnet.

### 1.2 Fórmulas de Cálculo Porcentual

Para cada característica $c$ con $N_{\text{aplicables}, c} = N_{\text{VERIFICADO}, c} + N_{\text{PARCIAL}, c} + N_{\text{INCUMPLIDO}, c} + N_{\text{SIN EVIDENCIA}, c}$:

$$\text{Puntuación Ponderada}_c (\%) = \frac{1,0 \cdot N_{\text{VERIFICADO}, c} + 0,5 \cdot N_{\text{PARCIAL}, c}}{N_{\text{aplicables}, c}} \times 100$$

Además, reportamos dos métricas diferenciadas para distinguir la **calidad de lo que está implementado y prometido hoy** frente a la **madurez global incluyendo requisitos recomendados y paquetes retenidos**:

1. **Cumplimiento sobre Línea Base Implementada (`Explícitos + Inferidos`, $N = 51$)**:
   $$\text{Cumplimiento Línea Base} = \frac{51 \times 1,0}{51} \times 100 = \mathbf{100,00\,\%}$$
2. **Cumplimiento Global Ponderado (`Total 72 Requisitos`, incluyendo los 21 Recomendados)**:
   $$\text{Cumplimiento Global Ponderado} = \frac{51 \times 1,0 + 8 \times 0,5 + 12 \times 0,0 + 1 \times 0,0}{72} \times 100 = \frac{55,0}{72} \times 100 = \mathbf{76,39\,\%}$$

> [!IMPORTANT]
> **Doble vista de clasificación ISO/IEC 25010:2023**:
> Como se documenta en `INFORME_FINAL.md`, el agente `Requirements-Agent` realiza primero un triaje binario (`FR` vs `NFR`) y asigna por defecto todo `FR` a `Functional Suitability` (incluso cuando el requisito es un control de seguridad como el bloqueo de Mainnet o un control de fiabilidad como la jerarquía de locks). Por rigor de auditoría presentamos:
> - **Tabla 2.1**: Distribución exacta devuelta por `Requirements-Agent` (`requirements.json`).
> - **Tabla 2.2**: Matriz técnica completa por las **9 características de ISO/IEC 25010:2023** asignando cada uno de los 72 requisitos a su característica primaria de ingeniería de calidad.

---

## 2. Resumen Cuantitativo de la Matriz ISO/IEC 25010:2023

### 2.1 Vista A — Agrupación Automática Directa de `Requirements-Agent` (`iso_category`)

| Categoría ISO (`Requirements-Agent`) | Total ($N$) | `VERIFICADO` | `PARCIAL` | `INCUMPLIDO` | `SIN EVIDENCIA` | Línea Base (`Expl+Inf`) | Puntuación Global Ponderada |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Functional Suitability** | **48** | 37 | 3 | 8 | 0 | 100,0 % (`37/37`) | **80,21 %** (`38,5 / 48`) |
| **Reliability** | **8** | 4 | 4 | 0 | 0 | 100,0 % (`4/4`) | **75,00 %** (`6,0 / 8`) |
| **Security** | **6** | 6 | 0 | 0 | 0 | 100,0 % (`6/6`) | **100,00 %** (`6,0 / 6`) |
| **Maintainability** | **4** | 1 | 0 | 2 | 1 | 100,0 % (`1/1`) | **25,00 %** (`1,0 / 4`) |
| **Performance Efficiency** | **3** | 2 | 0 | 1 | 0 | 100,0 % (`2/2`) | **66,67 %** (`2,0 / 3`) |
| **Compatibility** | **3** | 1 | 1 | 1 | 0 | 100,0 % (`1/1`) | **50,00 %** (`1,5 / 3`) |
| **TOTAL** | **72** | **51** | **8** | **12** | **1** | **100,00 % (`51/51`)** | **76,39 % (`55,0 / 72`)** |

---

### 2.2 Vista B — Matriz de Auditoría Técnica Completa (Las 9 Características de ISO/IEC 25010:2023)

En esta vista técnica se mapean los **72 requisitos** a las **9 características de ISO/IEC 25010:2023** según su naturaleza real de ingeniería (reclasificando los controles funcionales de seguridad, fiabilidad, usabilidad CLI y flexibilidad que el triaje binario de `Requirements-Agent` agrupó en `Functional Suitability`):

| # | Característica ISO/IEC 25010:2023 | Requisitos Asociados (`HK-REQ-*`) | Total ($N$) | `VERIFICADO` | `PARCIAL` | `INCUMPLIDO` | `SIN EVIDENCIA` | Puntuación Ponderada |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| 1 | **Adecuación Funcional (Functional Suitability)** | `010`, `013`, `016`, `021`, `022`, `023`, `024`, `025`, `027`, `037`, `039`, `042`, `044`, `045`, `048`, `049`, `052`, `071` | **18** | 12 | 1 | 5 | 0 | **69,44 %** |
| 2 | **Eficiencia de Desempeño (Performance Efficiency)** | `033`, `036`, `040`, `050`, `067` | **5** | 3 | 1 | 1 | 0 | **70,00 %** |
| 3 | **Compatibilidad (Compatibility)** | `028`, `034`, `047`, `065`, `068` | **5** | 2 | 1 | 2 | 0 | **50,00 %** |
| 4 | **Capacidad de Interacción / Usabilidad (Interaction Capability)** | `004`, `008`, `061` | **3** | 3 | 0 | 0 | 0 | **100,00 %** |
| 5 | **Fiabilidad (Reliability)** | `005`, `014`, `020`, `030`, `031`, `032`, `035`, `056`, `057`, `066`, `072` | **11** | 7 | 3 | 1 | 0 | **77,27 %** |
| 6 | **Seguridad (Security)** | `003`, `006`, `007`, `015`, `017`, `018`, `019`, `026`, `029`, `038`, `041`, `043`, `046`, `051`, `054`, `055`, `059`, `060`, `062`, `063` | **20** | 17 | 1 | 2 | 0 | **87,50 %** |
| 7 | **Mantenibilidad (Maintainability)** | `009`, `011`, `058`, `064`, `069`, `070` | **6** | 3 | 0 | 2 | 1 | **50,00 %** |
| 8 | **Flexibilidad / Portabilidad (Flexibility)** | `012` | **1** | 0 | 1 | 0 | 0 | **50,00 %** |
| 9 | **Seguridad Operativa / Indemnidad (Safety — ISO 25010:2023)** | `001`, `002`, `053` | **3** | 3 | 0 | 0 | 0 | **100,00 %** |
| — | **TOTAL CONSOLIDADO** | **`HK-REQ-001` a `HK-REQ-072`** | **72** | **51** | **8** | **12** | **1** | **76,39 %** |

---

## 3. Evaluación Detallada por Característica ISO/IEC 25010:2023

### 3.1 Adecuación Funcional (Functional Suitability)
- **Subcaracterísticas**: *Completitud funcional*, *Corrección funcional*, *Pertinencia funcional*.
- **Requisitos Satisfechos (`VERIFICADO` — 12)**:
  - `HK-REQ-010`: Carga determinista de configuración y precedencia sin red (`packages/config/src/loader.ts#L1-L210`).
  - `HK-REQ-013`: Canonicalización JSON RFC-8785 (`hashVersion: 5`) y rechazo de `NaN`/`Infinity` (`packages/artifacts/src/canonical.ts#L87-L379`).
  - `HK-REQ-016`: Derivación pura de estado de transacción (`deriveTxStatus`) con precedencia de conflicto (`packages/artifacts/src/tx-status.ts#L273-L583`).
  - `HK-REQ-021`: Rechazo de firmas de usuario sobre entradas de pactos (`COVENANT_INPUT_REQUIRES_COVENANT_SPEND`, `packages/accounts/src/signer.ts`).
  - `HK-REQ-022`: Cálculo exacto del preimage sighash Schnorr en Kaspa y verificación criptográfica inmediata post-firma (`packages/tx-builder/src/sighash.ts`).
  - `HK-REQ-025`: Selección determinista de monedas e iteración de masa KIP-9 (`packages/tx-builder/src/fee-mass.ts`).
  - `HK-REQ-027`: Empaquetado de payload de script P2SH y versión de script en covenants (`packages/tx-builder/src/covenant.ts`).
  - `HK-REQ-037`: Orquestación de pagos e idempotencia por clave en `@hardkas/sdk` (`packages/sdk/src/tx.ts`).
  - `HK-REQ-039`: Construcción de transacciones génesis y transición 1:1 Toccata V1 (`packages/sdk/src/covenants/toccata-v1.ts`).
  - `HK-REQ-042`: Retroceso acotado en cadena de padres seleccionados (`tx wait --address`, 1.000/10.000 bloques, `packages/sdk/src/waiters.ts`).
  - `HK-REQ-044`: Serialización L1->L2 y minería determinista de prefijos en `@hardkas/bridge-local` (`packages/bridge-local/src/index.ts`).
  - `HK-REQ-049`: Proyección SQLite reconstruible de solo lectura con `sync`, `doctor` y `rebuild` (`packages/query-store/src/index.ts`).
  - `HK-REQ-052`: Ejecución de trabajos en segundo plano con checkpoints persistentes (`packages/jobs/src/index.ts`).
- **Requisitos Parciales (`PARCIAL` — 1)**:
  - `HK-REQ-048`: El ciclo de vida SilverScript en nodo real funciona por CLI en `localnet`, pero está deshabilitado en el método de alto nivel del SDK (`SDK_SILVER_REAL_LIFECYCLE_UNSUPPORTED`).
- **Requisitos Incumplidos (`INCUMPLIDO` — 5)**:
  - `HK-REQ-023`: `lockTime` distinto de cero rechazado con `LOCK_TIME_NOT_SUPPORTED`.
  - `HK-REQ-024`: Gasto desde direcciones ECDSA P2PK rechazado con `ECDSA_SPEND_NOT_SUPPORTED`.
  - `HK-REQ-045`: `HardkasCovenants.planDeploy` y `planSpend` lanzan `COVENANT_PLAN_UNSUPPORTED` (`packages/sdk/src/covenants.ts#L494-L516`).
  - `HK-REQ-071`: El gate `pnpm check:artifacts` (`packages/artifacts/test/fixtures/valid`) falla con **Exit Code 1** porque el directorio `valid/` está vacío (`0 archivos`).

### 3.2 Eficiencia de Desempeño (Performance Efficiency)
- **Subcaracterísticas**: *Comportamiento temporal*, *Utilización de recursos*, *Capacidad*.
- **Requisitos Satisfechos (`VERIFICADO` — 3)**:
  - `HK-REQ-033`: Supervisión de `kaspad`, descarga con SHA-256 y rotación de logs (`@hardkas/node-runner`).
  - `HK-REQ-040`: Verificador Groth16 aislado en subproceso con timeout $\le 15,0\text{ s}$ y tope de concurrencia `MAX_CONCURRENT_PAIRINGS = 4` (`packages/sdk/src/zk/groth16-verifier.ts#L156-L800`).
  - `HK-REQ-050`: Coin control y snapshots capaces de indexar hasta **50.000 UTXOs** en memoria (`benchmarks/utxo.bench.ts`).
- **Requisitos Parciales (`PARCIAL` — 1)**:
  - `HK-REQ-036`: Acumulación masiva de UTXOs en sesiones `localnet` desborda el límite de trama WebSocket de 100 MiB (`LFU-UTXO-READ-LIMIT`) si no se consolida periódicamente.
- **Requisitos Incumplidos (`INCUMPLIDO` — 1)**:
  - `HK-REQ-067`: `@hardkas/dev-server` carece de limitador de tasa (rate limiting) en `/api/*`.

### 3.3 Compatibilidad (Compatibility)
- **Subcaracterísticas**: *Coexistencia*, *Interoperabilidad*.
- **Requisitos Satisfechos (`VERIFICADO` — 2)**:
  - `HK-REQ-028`: Compatibilidad de protocolo wRPC/JSON-RPC con `kaspad v1.0.0` / `rusty-kaspa v2.1.0` (`@hardkas/kaspa-rpc`).
  - `HK-REQ-065`: Gate de licencias (`scripts/check-licenses.mjs` -> **PASS**): 0 dependencias copyleft requeridas; `snarkjs` (`GPL-3.0`) aislado como peer dependency opcional.
- **Requisitos Parciales (`PARCIAL` — 1)**:
  - `HK-REQ-034`: Artefactos de transacción firmada V0 registran `storageMass: 0` mientras el nodo `kaspad` calcula la masa KIP-9 al aceptar en mempool.
- **Requisitos Incumplidos (`INCUMPLIDO` — 2)**:
  - `HK-REQ-047`: `@hardkas/pskt-native` está compilado contra `rusty-kaspa 2.0.1` (desfasado respecto a `2.1.0`), solo soporta `win32-x64` y tiene `index.d.ts` vacío (retenido en privado).
  - `HK-REQ-068`: `@hardkas/client` no envía la cabecera `Authorization: Bearer <token>` requerida por `@hardkas/dev-server` (retenido en privado).

### 3.4 Capacidad de Interacción / Usabilidad (Interaction Capability)
- **Subcaracterísticas**: *Reconocibilidad de adecuación*, *Aprendibilidad*, *Operabilidad*, *Protección contra errores de usuario*.
- **Requisitos Satisfechos (`VERIFICADO` — 3)**:
  - `HK-REQ-004`: Jerarquía `HardkasError` con códigos legibles por máquina y sugerencias (`hint`) de remediación.
  - `HK-REQ-008`: Resolución determinista de rutas del espacio de trabajo y soporte para `HARDKAS_HOME`.
  - `HK-REQ-061`: Etiquetado explícito de nivel de madurez en cada comando de `hardkas --help` y salida `--json` estructurada.

### 3.5 Fiabilidad (Reliability)
- **Subcaracterísticas**: *Disponibilidad*, *Tolerancia a fallos*, *Recuperabilidad*.
- **Requisitos Satisfechos (`VERIFICADO` — 7)**:
  - `HK-REQ-005`: Jerarquía determinista de bloqueos de archivo (`keystore: 10 < artifact: 20 < index: 30 < config: 40`) con prevención de interbloqueos y ruptura de locks huérfanos (`packages/core/src/locks.ts#L18-L195`).
  - `HK-REQ-014`: Almacén de artefactos inmutable write-once (`ARTIFACT_IDENTITY_CONFLICT`) y validación de esquemas (`scripts/check-artifact-registry.mjs` -> **PASS**).
  - `HK-REQ-020`: Escritura atómica de keystores con `fsyncSync` y reintentos exponenciales ante `EPERM` en Windows (`packages/accounts/src/atomic-write.ts#L18-L65`).
  - `HK-REQ-030`: Reconciliación mempool/DAG en `RpcUtxoProvider` para evitar dobles gastos por retraso de indexación (`packages/kaspa-rpc/src/utxo-provider.ts`).
  - `HK-REQ-031`: Ejecución determinista en memoria en `@hardkas/simulator` con snapshots restaurables y reloj virtual.
  - `HK-REQ-032`: Gestión de ciclo de vida de nodos `localnet`, detección de colisiones de puertos y limpieza de procesos.
  - `HK-REQ-066`: Gate hermético de pruebas (`scripts/gate-hermetic.mjs`) que bloquea toda red externa y los puertos wRPC de Kaspa (`16210`, `17210`, `18210`, `18211`).
- **Requisitos Parciales (`PARCIAL` — 3)**:
  - `HK-REQ-035`: El verificador del simulador valida opcodes de introspección Toccata y multisig/P2PK, pero no emula un intérprete completo de pila arbitraria de Kaspa VM.
  - `HK-REQ-057`: `@hardkas/plugin-rpc-backend` carece de reconexión automática en WebSocket y jitter aleatorio (retenido en privado).
  - `HK-REQ-072`: Existen 11 tests omitidos (`[known gap]`) documentados en `limitations.md` y sensibilidad a rutas cortas 8.3 (`~`) en Windows.
- **Requisitos Incumplidos (`INCUMPLIDO` — 1)**:
  - `HK-REQ-056`: `ProjectionStoreJson.setAll` (`packages/query-store/src/projection-store.ts#L35-L40`) no utiliza `writeFileAtomicSync` ni adquiere el lock `LOCK_ORDER.index`.

### 3.6 Seguridad (Security)
- **Subcaracterísticas**: *Confidencialidad*, *Integridad*, *No repudio*, *Responsabilidad*, *Autenticidad*, *Resistencia*.
- **Requisitos Satisfechos (`VERIFICADO` — 17)**:
  - `HK-REQ-003` (fronteras WASM y anti-prototype pollution), `HK-REQ-006` (validación Bech32m y `MAX_SOMPI`), `HK-REQ-007` (redacción automática de secretos y credenciales URL), `HK-REQ-015` (confinamiento de rutas, prohibición de symlinks y `MAX_LINEAGE_PARENT_HOPS = 64`; **12/12 fixtures corruptos rechazados**), `HK-REQ-017` (paquetes de evidencia firmados con `canonicalHash`), `HK-REQ-018` (aislamiento de cuentas por red `ACCOUNT_NETWORK_MISMATCH`), `HK-REQ-019` (keystores **Argon2id + AES-256-GCM + AAD** y `derivedKey.fill(0)`), `HK-REQ-026` (prohibición de reutilización de entradas y validación de sumas UTXO), `HK-REQ-029` (`assertBroadcastNodeIdentity` + `assertBroadcastNodeSynced` en SDK/CLI), `HK-REQ-038` (compilador SilverScript sin ejecución de shell — `SILVERSCRIPT_SECURITY_SCAN_PASSED`), `HK-REQ-041` (vinculación de salidas L1 en Toccata RISC Zero `proof-and-output-bound`), `HK-REQ-043` (contratos de custodia 2-de-3 y `rescue-v1` con tope de comisión de 500.000 sompi), `HK-REQ-051` (bloqueo `WALLET_SYNTHETIC_NETWORK_BLOCKED` fuera de `simnet`), `HK-REQ-059` (bloqueo `EXTENSION_NOT_PUBLISHED` y verificación `--sha256`), `HK-REQ-060` (reserva fail-closed y 0 faucets públicos en `testnet-qualification`), `HK-REQ-062` (endurecimiento de `dev-server`: `127.0.0.1`, anti-DNS rebinding, CORS, Bearer de 32 bytes, CSRF `X-Hardkas-Request: true`, `no-store`) y `HK-REQ-063` (`DEV_AUTOSIGN_NOT_ALLOWED` por defecto).
- **Requisitos Parciales (`PARCIAL` — 1)**:
  - `HK-REQ-046`: Imposibilidad en Kaspa L1 de que un P2SH comprometa su propio outpoint (`ZK_UTXO_BINDING_UNSATISFIABLE`), requiriendo composición con Toccata V1 si se reutiliza una misma dirección ZK con idéntico importe.
- **Requisitos Incumplidos (`INCUMPLIDO` — 2)**:
  - `HK-REQ-054`: `WalletToolkit.verifySpendNetwork` omite `assertBroadcastNodeSynced`.
  - `HK-REQ-055`: `WalletToolkit` emplea claves sintéticas derivadas del nombre en lugar de keystores HD reales de `@hardkas/accounts`.

### 3.7 Mantenibilidad (Maintainability)
- **Subcaracterísticas**: *Modularidad*, *Reusabilidad*, *Analizabilidad*, *Modificabilidad*, *Testabilidad*.
- **Requisitos Satisfechos (`VERIFICADO` — 3)**:
  - `HK-REQ-009`: Trazas y métricas estructuradas con redacción (`@hardkas/observability`).
  - `HK-REQ-011`: Arquitectura acíclica de 5 niveles (Niveles 0 a 4).
  - `HK-REQ-064`: Sincronización de versiones (`0.13.0-rc.2` en 6.268 archivos) y aislamiento de los 14 paquetes privados respecto a los 22 publicados.
- **Requisitos Incumplidos (`INCUMPLIDO` — 2)**:
  - `HK-REQ-069`: `scripts/check-typescript-hygiene.mjs` falla (`Exit Code 1`, 2.448 ocurrencias de `any` y bloques `catch (e: any)`).
  - `HK-REQ-070`: `scripts/docs-check.mjs` falla (`Exit Code 1`, 4 enlaces rotos incluyendo rutas `C:\Users\jrodr\...`).
- **Requisitos Sin Evidencia (`SIN EVIDENCIA` — 1)**:
  - `HK-REQ-058`: 0 archivos de test en `@hardkas/storage-postgres`, `@hardkas/storage-sqlite`, `@hardkas/plugin-local-indexer` y `@hardkas/simulator-adapters`.

### 3.8 Flexibilidad / Portabilidad (Flexibility — ISO/IEC 25010:2023)
- **Subcaracterísticas**: *Adaptabilidad*, *Escalabilidad*, *Instalabilidad*, *Reemplazabilidad*.
- **Requisitos Parciales (`PARCIAL` — 1)**:
  - `HK-REQ-012`: Portabilidad multiplataforma en Node.js (`>=22 <25`) en Windows, Linux y macOS para los 22 paquetes publicados, pero con fricciones residuales en Windows (rutas cortas 8.3 en tests de CLI y binario `@hardkas/pskt-native` compilado solo para `win32-x64`).

### 3.9 Seguridad Operativa / Indemnidad (Safety — Nueva característica en ISO/IEC 25010:2023)
- **Subcaracterísticas**: *Restricción operativa*, *Identificación de riesgos*, *Protección ante fallos (Fail-safe)*, *Advertencia de peligros*.
- **Requisitos Satisfechos (`VERIFICADO` — 3)**:
  - `HK-REQ-001`: Bloqueo total e incondicional de conexiones y transacciones hacia Kaspa Mainnet (`MAINNET_CONNECTION_DISABLED`, `MAINNET_TRANSACTION_DISABLED`), impidiendo cualquier pérdida económica accidental durante el desarrollo o las pruebas.
  - `HK-REQ-002`: Resolución obligatoria de `ExecutionTarget` y prohibición de contaminación entre mundos simulados y nodos reales (`SIM_TO_REAL_LEAK`, `REAL_TO_SIM_POLLUTION`).
  - `HK-REQ-053`: Bloqueo total de conexiones y escrituras hacia Igra Mainnet (`chainId: 38833`, `L2_MAINNET_WRITE_BLOCKED`).
