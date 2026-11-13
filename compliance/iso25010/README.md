# HardKAS v0.13.0-rc.2 — Paquete de Auditoría Integral ISO/IEC 25010:2023

## 1. Propósito y Alcance

Este directorio contiene la auditoría integral de ingeniería de requisitos, calidad de software y seguridad blockchain del monorepo **HardKAS (`v0.13.0-rc.2`)** conforme al modelo de calidad de producto **ISO/IEC 25010:2023**, ejecutada combinando:

1. **Inspección estática y dinámica exhaustiva del monorepo completo** (`packages/`, `apps/`, `labs/`, `examples/`, `benchmarks/`, `fixtures/`, `templates/`, `infra/`, `scripts/`, `.github/`, `docs/` y manifiestos raíz).
2. **Ingeniería inversa y elicitación de 72 requisitos trazables (`HK-REQ-001` a `HK-REQ-072`)**, clasificados según su origen en **Explícitos (35)**, **Inferidos del código (16)** y **Recomendados / Brechas detectadas (21)**.
3. **Procesamiento automatizado real mediante `Requirements-Agent`** (`https://github.com/mhabibullah-dev/Requirements-Agent`) en 6 lotes por subsistema, conservando los artefactos JSON y CSV originales sin alterar el código fuente del agente (`req_agent.py`).
4. **Verificación empírica en entorno local seguro (sandbox)** mediante la ejecución de los scripts de control de lanzamiento y seguridad del repositorio, sin transmitir transacciones a redes públicas, sin contactar con mainnet y sin modificar el código de producción.

---

## 2. Estructura de Entregables (`compliance/iso25010/`)

```text
compliance/iso25010/
├── README.md                                  # Guía ejecutiva, metodología y reproducción de la auditoría
├── INVENTARIO.md                              # Inventario exhaustivo de los 35 paquetes, apps, labs, tests y scripts
├── REQUISITOS.md                              # Catálogo completo de los 72 requisitos (Explícitos, Inferidos, Recomendados)
├── MATRIZ_ISO25010.md                         # Matriz de evaluación ISO/IEC 25010:2023 con método matemático de puntuación
├── SEGURIDAD.md                               # Auditoría profunda de seguridad criptográfica, RPC, dev-server, ZK y supply-chain
├── RENDIMIENTO.md                             # Evaluación de eficiencia de desempeño, benchmarks y límites operativos
├── MANTENIBILIDAD.md                          # Evaluación de arquitectura modular (Niveles 0-4), cobertura y deuda técnica
├── HALLAZGOS.md                               # Registro estructurado de incumplimientos, vulnerabilidades y riesgos
├── PLAN_DE_ACCION.md                          # Hoja de ruta priorizada (Crítica, Alta, Media, Baja) previa a auditoría externa
├── INFORME_FINAL.md                           # Informe ejecutivo y técnico en español (respuesta a las 8 preguntas de Fase 8)
├── EXPEDIENTE_REPRODUCIBLE.md                 # Protocolo de reproducción independiente, índice de logs y manifiesto SHA-256
├── ALCANCE_CERTIFICACION_AENOR_AQCLAB.md      # Delimitación de alcance (22 paquetes publicados vs 14 privados) para AQC Lab y AENOR
├── requirements.json                          # Salida consolidada de Requirements-Agent + metadatos de trazabilidad (72 ítems)
├── requirements.csv                           # Tabla consolidada en formato CSV de los 72 requisitos procesados
└── evidence/                                  # Evidencias verificables, logs completos, extractos de código y hashes SHA-256
    ├── GIT_AND_ENV_SNAPSHOT.txt               # Instantánea exacta del commit Git HEAD, estado del árbol y entorno de ejecución
    ├── git_and_env_snapshot.json              # Instantánea de Git y entorno en formato JSON
    ├── SOURCE_SHA256_MANIFEST.json            # Manifiesto criptográfico SHA-256 de todos los archivos fuente/test/config auditados
    ├── SOURCE_SHA256_MANIFEST.csv             # Tabla CSV de hashes SHA-256 y tamaño en bytes por archivo fuente
    ├── CODE_EVIDENCE_EXTRACT.md               # Volcado literal numerado del código fuente para verificar hallazgos sin clonar el repo
    ├── gate_verification_summary.json         # Índice de resultados, duración y SHA-256 de los 11 gates ejecutados
    ├── logs/                                  # Logs íntegros (.log con STDOUT/STDERR completos) de los 11 controles
    │   ├── 01_check-versions.log
    │   ├── 02_check-licenses.log
    │   ├── 03_check-known-gaps.log
    │   ├── 04_check-silver-no-shell-exec.log
    │   ├── 05_check-artifact-registry.log
    │   ├── 06_check-query-store-security.log
    │   ├── 07_check-forbidden-claims.log
    │   ├── 08_check-artifact-fixtures-corrupted.log
    │   ├── 09_check-artifact-fixtures-valid.log
    │   ├── 10_docs-check.log
    │   └── 11_check-typescript-hygiene.log
    ├── reqagent_smoke_test/                   # Salida original de la prueba piloto (Fase 1)
    │   ├── requirements_output.json
    │   └── requirements_output.csv
    └── reqagent_batches/                      # Salidas JSON y CSV originales generadas por Requirements-Agent (Fase 4)
        ├── batch_1_foundations/
        ├── batch_2_artifacts_accounts/
        ├── batch_3_tx_rpc_sim/
        ├── batch_4_sdk_silver_zk/
        ├── batch_5_extensions_storage/
        └── batch_6_cli_devserver_ci_quality/
```

---

## 3. Resumen Ejecutivo de Resultados

| Métrica de Auditoría | Valor Verificado |
| :--- | :--- |
| **Versión auditada** | `0.13.0-rc.2` (MIT, Node `>=22 <25`, `pnpm@9.0.0`) |
| **Paquetes en `packages/*`** | **35 paquetes** (21 `private: false` + CLI/plantillas = **22 manifiestos publicables** y **14 privados retenidos**) |
| **Archivos de código fuente (`packages/*/src`)** | **675 archivos TypeScript** + **7 archivos Rust** (`@hardkas/pskt-native`) |
| **Archivos de prueba (`*.test.ts`)** | **885 archivos de test** en el monorepo (**874** dentro de `packages/*`) en 9 configuraciones Vitest |
| **Superficie de API pública documentada** | **1.422 símbolos exportados** en paquetes publicables (**500** ejercitados en tests = **35,2 %**) + **99** en internos (**1.521 total**) |
| **Requisitos extraídos y auditados** | **72 requisitos** (`HK-REQ-001` a `HK-REQ-072`): **35 Explícitos**, **16 Inferidos**, **21 Recomendados** |
| **Clasificación de `Requirements-Agent`** | **46 Funcionales (FR)**, **23 No Funcionales (NFR)**, **3 Restricciones Arquitectónicas (`NONE`)** |
| **Estado de verificación contra el código** | **51 `VERIFICADO` (70,83 %)**, **8 `PARCIAL` (11,11 %)**, **12 `INCUMPLIDO` (16,67 %)**, **1 `SIN EVIDENCIA` (1,39 %)** |
| **Cumplimiento sobre línea base implementada** | **100,00 %** sobre los **51 requisitos Explícitos + Inferidos** (`51/51 VERIFICADO`) |
| **Puntuación ponderada global ISO/IEC 25010:2023** | **76,39 %** sobre el total de **72 requisitos** (incluyendo los 21 requisitos recomendados y brechas de gates) |

---

## 4. Metodología de Ejecución de `Requirements-Agent` (Fases 1 y 4)

1. **Aislamiento**: El repositorio `Requirements-Agent` se clonó fuera del árbol de producción en un directorio auxiliar aislado con su propio entorno virtual Python 3.14 (`google-genai==3.1.0`, `python-dotenv==1.2.4`, `pandas==3.1.1`).
2. **Preservación del agente original**: El archivo `req_agent.py` se mantuvo **100 % intacto**. Para adaptarlo al análisis por lotes del monorepo en Windows en 2026 sin editar el script original, el orquestador (`batch_runner.py`) importa `req_agent` e inyecta en tiempo de ejecución:
   - Resolución DNS IPv4 preferente (`socket.AF_INET`) para evitar el bloqueo de 120 segundos por intento IPv6 de `httpx2` en Windows.
   - Sustitución en memoria de la constante `MODEL_NAME = "gemini-2.5-flash"` (modelo retirado con HTTP 404 para claves nuevas) por `"gemini-3.5-flash-lite"`.
   - Formato de entrada compatible con la expresión regular de segmentación de `req_agent.preprocess_text()` (`Requirement HK-REQ-XXX states that ...`), logrando segmentación exacta de **12 requisitos atómicos por lote × 6 lotes = 72 requisitos**.
3. **Verificación de Gates Locales (Fase 5)**: Se ejecutaron 11 controles estáticos y de fixtures del repositorio (`check-versions`, `check-licenses`, `check-known-gaps`, `check-silver-no-shell-exec`, `check-artifact-registry`, `check-query-store-security`, `check-forbidden-claims`, `check-artifact-fixtures --reject`, `check-artifact-fixtures valid`, `docs-check` y `check-typescript-hygiene`), cuyos resultados exactos se recogen en `evidence/gate_verification_summary.json` y `HALLAZGOS.md`.
