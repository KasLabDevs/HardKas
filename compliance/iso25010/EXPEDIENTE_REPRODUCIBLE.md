# EXPEDIENTE TÉCNICO REPRODUCIBLE DE AUDITORÍA (`EXPEDIENTE_REPRODUCIBLE.md`)

## 1. Propósito de este Documento

En respuesta a la revisión técnica del informe inicial, este documento convierte la evaluación en un **expediente técnico 100 % reproducible y verificable de forma independiente**, resolviendo las observaciones señaladas en la revisión:

1. **Trazabilidad exacta de la versión congelada del código fuente**: Se adjunta la instantánea de Git y entorno ([`evidence/GIT_AND_ENV_SNAPSHOT.txt`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/GIT_AND_ENV_SNAPSHOT.txt)) y el **manifiesto criptográfico SHA-256** de todos los archivos de código fuente, pruebas, scripts y configuración del monorepo ([`evidence/SOURCE_SHA256_MANIFEST.json`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/SOURCE_SHA256_MANIFEST.json) y [`evidence/SOURCE_SHA256_MANIFEST.csv`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/SOURCE_SHA256_MANIFEST.csv)).
2. **Logs íntegros de ejecución de los 11 controles (gates)**: Además del resumen JSON ([`evidence/gate_verification_summary.json`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/gate_verification_summary.json)), se incluyen en [`evidence/logs/`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/logs/) los **11 archivos `.log` completos** con la salida estándar (`STDOUT`), salida de error (`STDERR`), comando exacto, marca temporal UTC, duración en milisegundos, código de salida y hash SHA-256 de cada log.
3. **Extracto literal verificable del código fuente auditado**: Para que cualquier revisor que reciba únicamente el archivo ZIP de `compliance/iso25010/` pueda inspeccionar el código real sin necesidad de clonar el repositorio completo, se incluye [`evidence/CODE_EVIDENCE_EXTRACT.md`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/CODE_EVIDENCE_EXTRACT.md) con las líneas exactas numeradas y el hash SHA-256 de los archivos donde residen tanto los controles verificados como los incumplimientos (`HAL-01` a `HAL-12`).
4. **Delimitación del alcance de certificación para AQC Lab y AENOR**: Se incluye [`ALCANCE_CERTIFICACION_AENOR_AQCLAB.md`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/ALCANCE_CERTIFICACION_AENOR_AQCLAB.md) separando los **21 paquetes publicables (`packages/*`) / 22 artefactos MIT** respecto de los **14 paquetes privados retenidos (`"private": true`)**.

---

## 2. Inventario de Evidencias Reproducibles (`compliance/iso25010/evidence/`)

| Archivo / Directorio de Evidencia | Contenido y Función de Verificación Independiente |
| :--- | :--- |
| [`evidence/GIT_AND_ENV_SNAPSHOT.txt`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/GIT_AND_ENV_SNAPSHOT.txt) | Commit `HEAD` exacto de Git, rama, últimos 5 commits, estado limpio del árbol de producción (`git status --short`), versiones de Node.js, `pnpm`, Python y sistema operativo. |
| [`evidence/git_and_env_snapshot.json`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/git_and_env_snapshot.json) | Versión estructurada legible por máquina de la instantánea del entorno y repositorio. |
| [`evidence/SOURCE_SHA256_MANIFEST.json`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/SOURCE_SHA256_MANIFEST.json) | Hash SHA-256 individual y tamaño en bytes de cada archivo de código fuente, test, script y configuración auditado en el monorepo, más el `corpus_aggregate_sha256` global. |
| [`evidence/SOURCE_SHA256_MANIFEST.csv`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/SOURCE_SHA256_MANIFEST.csv) | Tabla CSV (`path,size_bytes,sha256`) para verificación inmediata con herramientas de auditoría o hojas de cálculo. |
| [`evidence/CODE_EVIDENCE_EXTRACT.md`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/CODE_EVIDENCE_EXTRACT.md) | Volcado literal con números de línea de los 14 bloques de código críticos (bloqueo Mainnet, `ExecutionTarget`, Argon2id keystore, verificador Groth16, Toccata L1, `WalletToolkit.verifySpendNetwork`, `ProjectionStoreJson.setAll`, `HardkasCovenants`, `dev-server`). |
| [`evidence/gate_verification_summary.json`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/gate_verification_summary.json) | Índice maestro de los 11 gates ejecutados con sus códigos de salida (`8 PASS / 3 FAIL`), tiempos de ejecución y hashes SHA-256 de sus archivos `.log`. |
| [`evidence/logs/01_check-versions.log`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/logs/01_check-versions.log) | Log íntegro de `node scripts/check-versions.mjs` (**Exit 0 — PASS**, 6.268 archivos en `0.13.0-rc.2`). |
| [`evidence/logs/02_check-licenses.log`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/logs/02_check-licenses.log) | Log íntegro de `node scripts/check-licenses.mjs` (**Exit 0 — PASS**, 22 paquetes MIT, 0 copyleft requeridas). |
| [`evidence/logs/03_check-known-gaps.log`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/logs/03_check-known-gaps.log) | Log íntegro de `node scripts/check-known-gaps.mjs` (**Exit 0 — PASS**, 11 skips documentados). |
| [`evidence/logs/04_check-silver-no-shell-exec.log`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/logs/04_check-silver-no-shell-exec.log) | Log íntegro de `node scripts/check-silver-no-shell-exec.mjs` (**Exit 0 — PASS**, `SILVERSCRIPT_SECURITY_SCAN_PASSED`). |
| [`evidence/logs/05_check-artifact-registry.log`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/logs/05_check-artifact-registry.log) | Log íntegro de `node scripts/check-artifact-registry.mjs` (**Exit 0 — PASS**). |
| [`evidence/logs/06_check-query-store-security.log`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/logs/06_check-query-store-security.log) | Log íntegro de `node scripts/check-query-store-security.mjs` (**Exit 0 — PASS**, `PHASE_8_QUERY_STORE_SECURITY_PASS`). |
| [`evidence/logs/07_check-forbidden-claims.log`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/logs/07_check-forbidden-claims.log) | Log íntegro de `node scripts/check-forbidden-claims.mjs` (**Exit 0 — PASS**). |
| [`evidence/logs/08_check-artifact-fixtures-corrupted.log`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/logs/08_check-artifact-fixtures-corrupted.log) | Log íntegro de rechazo de las 12 fixtures corruptas (**Exit 0 — PASS**, 12/12 rechazadas con errores tipados). |
| [`evidence/logs/09_check-artifact-fixtures-valid.log`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/logs/09_check-artifact-fixtures-valid.log) | Log íntegro del fallo en `packages/artifacts/test/fixtures/valid` (**Exit 1 — FAIL**, `the corpus is empty` -> evidencia directa de `HAL-03` / `HK-REQ-071`). |
| [`evidence/logs/10_docs-check.log`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/logs/10_docs-check.log) | Log íntegro del fallo en `node scripts/docs-check.mjs` (**Exit 1 — FAIL**, 4 enlaces rotos -> evidencia directa de `HAL-04` / `HK-REQ-070`). |
| [`evidence/logs/11_check-typescript-hygiene.log`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/logs/11_check-typescript-hygiene.log) | Log íntegro completo de `node scripts/check-typescript-hygiene.mjs` (**Exit 1 — FAIL**, listado completo línea por línea de los bloques `catch (e: any)` y conteo de `2.448 any` -> evidencia directa de `HAL-05` / `HK-REQ-069`). |
| [`evidence/reqagent_batches/`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/reqagent_batches/) | Los 6 directorios de lotes con los archivos `input.txt`, `requirements_output.json` y `requirements_output.csv` generados directamente por `Requirements-Agent`. |

---

## 3. Protocolo Paso a Paso para Reproducción Independiente por un Tercero

Cualquier auditor o revisor independiente que disponga del repositorio en el commit indicado en [`evidence/GIT_AND_ENV_SNAPSHOT.txt`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/GIT_AND_ENV_SNAPSHOT.txt) puede reproducir y comprobar todos los resultados ejecutando los siguientes pasos:

### Paso 1 — Verificar la integridad criptográfica del árbol de código fuente auditado
```powershell
git rev-parse HEAD
git status --short
```
Comprobar que el commit coincide con `git_commit_head` en `evidence/git_and_env_snapshot.json` y que los hashes SHA-256 de los archivos locales coinciden con `evidence/SOURCE_SHA256_MANIFEST.csv`.

### Paso 2 — Reproducir los 11 controles automatizados (Gates)
```powershell
node scripts/check-versions.mjs
node scripts/check-licenses.mjs
node scripts/check-known-gaps.mjs
node scripts/check-silver-no-shell-exec.mjs
node scripts/check-artifact-registry.mjs
node scripts/check-query-store-security.mjs
node scripts/check-forbidden-claims.mjs
node scripts/check-artifact-fixtures.mjs packages/artifacts/test/fixtures/corrupted --reject
node scripts/check-artifact-fixtures.mjs packages/artifacts/test/fixtures/valid
node scripts/docs-check.mjs
node scripts/check-typescript-hygiene.mjs
```
Los primeros 8 comandos finalizarán con código de salida `0` y los últimos 3 con código de salida `1`, produciendo exactamente la misma salida registrada en `compliance/iso25010/evidence/logs/01_*.log` a `11_*.log`.

### Paso 3 — Verificar los hallazgos en el código sin ejecutar nada
Abrir [`compliance/iso25010/evidence/CODE_EVIDENCE_EXTRACT.md`](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/compliance/iso25010/evidence/CODE_EVIDENCE_EXTRACT.md) y comprobar las líneas exactas de código fuente extraídas y firmadas con SHA-256 para cada hallazgo (`HAL-01` a `HAL-12`).
