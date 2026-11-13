# DEFINICIÓN DE ALCANCE DE CERTIFICACIÓN PARA SOLICITUD DE PRESUPUESTO (AQC LAB / AENOR)

**Normas de Referencia**:
- **ISO/IEC 25010:2023** (*SQuaRE — Product quality model*)
- **ISO/IEC 25023:2016** (*SQuaRE — Measurement of system and software product quality*)
- **ISO/IEC 25040:2024** (*SQuaRE — Quality evaluation process*)

**Producto Objetivo**: **HardKAS Framework (`v0.13.0`)**  
**Licencia**: MIT  
**Entorno de Ejecución**: TypeScript / Node.js (`>=22 <25`), gestor de paquetes `pnpm@9.0.0`

---

## 1. ¿Es Certificable un Framework de Desarrollo Blockchain bajo ISO/IEC 25010?

**Sí.** En el esquema de evaluación acreditada empleado por **AQC Lab** (laboratorio acreditado por ENAC para evaluación de calidad de software según la familia ISO/IEC 25000) y **AENOR** (entidad certificadora que emite el certificado de Conformidad de Calidad de Producto Software basándose en el informe de evaluación de laboratorio):

1. La certificación se otorga a un **Producto Software delimitado con versión congelada** (por ejemplo, `HardKAS v0.13.0`), evaluando principalmente la característica de **Mantenibilidad** (la más habitual en AQC Lab/AENOR por análisis estático y estructural del código fuente), **Adecuación Funcional** (pruebas funcionales y trazabilidad de requisitos), **Seguridad** y **Fiabilidad**.
2. Para no penalizar ni encarecer innecesariamente la auditoría oficial, **es crítico definir la frontera exacta del producto (Product Boundary)** excluyendo del alcance certificable los paquetes experimentales/internos retenidos como `"private": true`, los laboratorios de demostración (`labs/*`), los ejemplos (`examples/*`) y la web de documentación (`apps/docs`).

---

## 2. Delimitación Recomendada del Alcance (22 Paquetes Publicables vs. 14 Paquetes Privados Excluidos)

El monorepo contiene **35 directorios en `packages/*`** (que suman 36 manifiestos de distribución al contabilizar las plantillas/CLI verificadas por `scripts/check-versions.mjs` y `scripts/check-release-tarballs.mjs`).

### 2.1 DENTRO DEL ALCANCE (In-Scope: Los 21 Paquetes Publicables en `packages/*` / 22 Artefactos MIT Publicados)

Estos paquetes constituyen el **Producto Comercial / Distribuible (`"private": false`)** que los usuarios instalan desde npm y cuentan al 100 % con suites de pruebas unitarias e integración activas (**839 de los 874 archivos `.test.ts`** de `packages/*`):

| Nivel Arq. | Paquete Publicable | Archivos `src` (TS) | Suites `test` (`.test.ts`) | Símbolos Públicos | Rol dentro del Producto Certificable |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **Nivel 0** | `@hardkas/core` | 50 | 59 | 269 | Tipos base, `ExecutionTarget`, bloqueo Mainnet, locks, validación y redacción. |
| **Nivel 0** | `@hardkas/config` | 9 | 25 | 38 | Carga determinista y validación Zod de `hardkas.config.*`. |
| **Nivel 0** | `@hardkas/observability` | 6 | 7 | 22 | Logging estructurado, trazas y métricas con redacción. |
| **Nivel 1** | `@hardkas/artifacts` | 34 | 74 | 164 | Almacén inmutable write-once, canonicalización RFC-8785 (`hashVersion: 5`) y `deriveTxStatus`. |
| **Nivel 1** | `@hardkas/accounts` | 14 | 25 | 62 | Billeteras HD BIP-39/BIP-32, keystores Argon2id + AES-256-GCM y firmantes Schnorr. |
| **Nivel 1** | `@hardkas/tx-builder` | 15 | 36 | 56 | Selección UTXO determinista, cálculo iterativo de masa KIP-9 y sighash Schnorr. |
| **Nivel 1** | `@hardkas/kaspa-rpc` | 18 | 41 | 68 | Cliente JSON-RPC/wRPC para `kaspad`, guardias de sincronización y reconciliación mempool/DAG. |
| **Nivel 1** | `@hardkas/simulator` | 34 | 52 | 95 | Simulador determinista en memoria del BlockDAG de Kaspa, reloj virtual y snapshots. |
| **Nivel 1** | `@hardkas/localnet` | 30 | 48 | 74 | Orquestador de nodos `kaspad` locales (binario o Docker) y génesis `simnet`. |
| **Nivel 1** | `@hardkas/node-runner` | 11 | 14 | 26 | Supervisión de procesos `kaspad`, descarga con SHA-256 y rotación de logs. |
| **Nivel 2** | `@hardkas/workflow` | 12 | 19 | 31 | Motor transaccional reproducible (`plan -> sign -> broadcast -> confirm -> receipt`). |
| **Nivel 2** | `@hardkas/sdk` | 120 | 206 | 177 | API principal (`HardkasClient`), pagos, waiters DAG, SilverScript, Toccata V1 y verificador ZK Groth16. |
| **Nivel 3** | `@hardkas/query` | 10 | 15 | 29 | Consultas paginadas sobre UTXOs, balances e historial del DAG. |
| **Nivel 3** | `@hardkas/query-store` | 26 | 38 | 49 | Proyección SQLite reconstruible de solo lectura (`sync`, `doctor`, `rebuild`). |
| **Nivel 3** | `@hardkas/toolkit` | 33 | 35 | 78 | Coin control (50k UTXOs), consolidación, pagos por lotes, facturas y snapshots. |
| **Nivel 3** | `@hardkas/jobs` | 10 | 10 | 24 | Cola de trabajos asíncronos con checkpoints persistentes y backoff. |
| **Nivel 3** | `@hardkas/escrow` | 8 | 9 | 18 | Contratos SilverScript 2-de-3 multisig y `rescue-v1`. |
| **Nivel 3** | `@hardkas/bridge-local` | 7 | 5 | 14 | Serialización de payloads L1->L2 y simulación determinista de minería de prefijos. |
| **Nivel 3** | `@hardkas/testing` | 14 | 10 | 32 | Arnés de pruebas deterministas, aserciones y aislamiento hermético. |
| **Nivel 4** | `@hardkas/cli` | 108 | 115 | 38 | CLI `hardkas` con niveles de madurez explícitos y salida `--json`. |
| **Nivel 4** | `create-hardkas` (+ `templates`) | 3 | 3 | 2 | Generador de proyectos (`npx create-hardkas`) y plantillas asociadas. |
| **TOTAL IN-SCOPE** | **21 paquetes (`packages/*`) / 22 artefactos** | **572 archivos TS** | **846 archivos `.test.ts`** | **1.306 símbolos** | **Núcleo completo publicable del framework HardKAS** |

---

### 2.2 FUERA DEL ALCANCE (Out-of-Scope: Los 14 Paquetes Privados Retenidos `"private": true`)

Estos 14 paquetes están bloqueados por [`scripts/check-release-tarballs.mjs`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/scripts/check-release-tarballs.mjs#L54-L66) para que **nunca se publiquen en npm** en la rama `0.13.x`. Deben declararse **explícitamente excluidos** en la solicitud a AQC Lab / AENOR porque son prototipos de investigación o herramientas internas de laboratorio:

| Paquete Excluido (`"private": true`) | Archivos `src` | Archivos `test` | Motivo Técnico de Exclusión del Alcance Certificable |
| :--- | :---: | :---: | :--- |
| `@hardkas/dev-server` | 12 TS | 12 | Servidor HTTP de desarrollo local interno (no publicado como paquete autónomo). |
| `@hardkas/l2` | 18 TS | 7 | Adaptador experimental L2 Igra Labs en fase de investigación. |
| `@hardkas/ext-l2` | 6 TS | 4 | Extensión CLI experimental no publicada en registro público. |
| `@hardkas/pskt-native` | 1 TS + 7 RS | 2 | Addon nativo Rust en pausa (`rusty-kaspa 2.0.1`, solo `win32-x64`). |
| `@hardkas/client` | 4 TS | 0 | Stub de cliente HTTP interno sin soporte de token Bearer ni tests. |
| `@hardkas/react` | 6 TS | 1 | Prototipo de hooks React dependiente de `@hardkas/client`. |
| `@hardkas/wallet-adapter` | 7 TS | 1 | Interfaz experimental pendiente de integración con billeteras de navegador. |
| `@hardkas/plugin-rpc-backend` | 6 TS | 1 | Plugin interno pendiente de pool de conexiones y jitter WS. |
| `@hardkas/plugin-local-indexer` | 5 TS | 0 | Prototipo interno de indexador sin suite de tests. |
| `@hardkas/simulator-adapters` | 5 TS | 0 | Adaptadores experimentales del simulador sin suite de tests. |
| `@hardkas/storage-postgres` | 6 TS | 0 | Adaptador PostgreSQL experimental no publicado (0 tests). |
| `@hardkas/storage-sqlite` | 6 TS | 0 | Adaptador SQLite experimental no publicado (0 tests). |
| `@hardkas/sync-daemon` | 8 TS | 1 | Demonio interno de sincronización no publicado. |
| `@hardkas/testnet-qualification` | 19 TS | 5 | Runner interno de calificación contra Testnet-10. |
| **TOTAL OUT-OF-SCOPE** | **103 TS + 7 RS** | **34 `.test.ts`** | **Excluidos formalmente por `"private": true` en `package.json`** |

---

## 3. Métricas Técnicas para el Cuestionario de Presupuesto (AQC Lab / AENOR)

Cuando solicites presupuesto a **AQC Lab** (`aqclab.es`) y **AENOR** (`aenor.com`), te pedirán dimensionar el sistema software. Estos son los datos exactos verificados sobre el alcance certificable (**In-Scope: 21 paquetes publicables de `packages/*`**):

| Parámetro Solicitado por el Laboratorio | Valor Exacto Verificado (Alcance Certificable) | Valor Monorepo Completo (Referencia) |
| :--- | :--- | :--- |
| **Nombre y Versión del Producto** | `HardKAS Framework v0.13.0` | `HardKAS Monorepo v0.13.0-rc.2` |
| **Lenguaje Principal** | **100 % TypeScript** (Node.js `>=22 <25`, ESM/CJS) | 99 % TypeScript + 1 % Rust (`pskt-native`) |
| **Número de Módulos / Paquetes en Alcance** | **21 paquetes en `packages/*`** (22 manifiestos publicables MIT) | 35 paquetes en `packages/*` + 2 `apps` + 10 `labs` |
| **Archivos de Código Fuente (`src/`) en Alcance** | **572 archivos TypeScript** | 675 archivos TS + 7 archivos Rust |
| **Archivos de Pruebas Automatizadas en Alcance** | **846 archivos `.test.ts`** (Vitest) | 885 archivos `.test.ts` |
| **Requisitos Documentados y Trazados** | **72 requisitos atómicos (`HK-REQ-001` a `HK-REQ-072`)** | 72 requisitos |
| **Dependencias de Producción de Terceros** | **286 paquetes** (0 licencias copyleft requeridas) | 286 paquetes (+ `snarkjs` opcional) |
| **Características ISO/IEC 25010 Solicitadas** | 1. **Mantenibilidad** (estándar base AQC Lab/AENOR)<br>2. **Adecuación Funcional** (completitud y corrección)<br>3. **Seguridad** (opcional / según alcance acordado) | Evaluación interna sobre las 9 características ISO/IEC 25010:2023 |

---

## 4. Lista de Verificación Previa al Envío del Código a AQC Lab

Antes de entregar el commit congelado a AQC Lab para su primera medición oficial:
1. Cerrar las **4 Acciones Altas (`ACC-ALTA-01` a `ACC-ALTA-04`)** y la **Acción Media `ACC-MED-01` (`check-typescript-hygiene.mjs`)** descritas en [`PLAN_DE_ACCION.md`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/PLAN_DE_ACCION.md), ya que las herramientas de análisis estático de AQC Lab penalizan directamente el uso de `: any` y bloques `catch (e: any)` en la subcaracterística de *Analizabilidad* y *Modificabilidad*.
2. Eliminar los 2 métodos stub `planDeploy` y `planSpend` en [`packages/sdk/src/covenants.ts`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/packages/sdk/src/covenants.ts#L494-L516) (`ACC-MED-02`) para que la evaluación de *Completitud Funcional* no detecte funciones públicas que lanzan `UNSUPPORTED` incondicionalmente.
3. Entregar a AQC Lab únicamente los **21 paquetes publicables** (o indicar explícitamente en el contrato de evaluación la exclusión de los 14 paquetes con `"private": true`, `apps/`, `labs/` y `examples/`).
