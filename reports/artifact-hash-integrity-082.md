# HardKAS 0.8.2-alpha — Artifact Hash Integrity Emergency Patch

## Context
Durante la auditoría criptográfica local (Local Cryptographic Audit 0.8.2-alpha), se descubrió una vulnerabilidad de severidad **CRITICAL** (Tamper Detection Bypass).
El método `HardkasArtifactsManager.verify()` permitía que artefactos mutados en memoria (ej. modificando `amountSompi` de "10" a "1099") pasaran la validación como válidos al no recalcular el `contentHash` criptográfico del contenido mutado. 
El verificador extraía el hash autodeclarado e ignoraba los datos mutados leyendo una copia prístina del caché o del disco. En consecuencia, simulaciones y envíos de transacciones locales aceptaban los datos corruptos.

## Implemented Fixes
1. **Zero-Trust Memory Validation**: Se modificó `HardkasArtifactsManager.verify()` en `@hardkas/sdk` para que, si recibe un objeto en memoria en lugar de un string ID, aplique la verificación criptográfica directamente sobre dicho objeto. Nunca vuelve a confiar en el `id` derivado para resolver datos limpios del caché si ya tiene los datos bajo inspección.
2. **Strict Hash Verification**: Se corrigió el mapeo de errores en `packages/artifacts/src/verify.ts`. Ahora el SDK no se conforma con validar el esquema Zod; intercepta formalmente discrepancias hash con el código de error `HASH_MISMATCH` y ausencia de hash con `MISSING_CONTENT_HASH`, exponiendo el fallo a nivel de interfaz de usuario.
3. **Pipeline Defense-in-Depth**:
   - `tx.simulate()` intercepta y verifica criptográficamente.
   - `tx.send()` intercepta y verifica criptográficamente antes de enviarlo a red o simulación.
   - `tx.sign()` intercepta planes mutados.
   - `replay.verify()` examina y rechaza los reportes y planes inyectados localmente.
4. **Forensic Regression Protection**:
   Se incorporó un test (en `tamper-detection.test.ts`) que levanta explícitamente el volcado forense `forensic-Tamper-Detection-1780477460463.json` capturado por el arnés de auditoría, garantizando que futuras regresiones lo aborden.

## Impact
Los componentes críticos de serialización ahora rechazan tajantemente (lanzando excepciones estrictas) cualquier artefacto donde el payload no encaje milimétricamente con su firma y hash canónico, sellando la ventana de envenenamiento criptográfico en tiempo de ejecución.
