# HARDKAS — CAMPAÑA EXTENDIDA DE PRUEBAS Y VERIFICACIÓN DE CONSENSO

**Documento:** HARDKAS_EXTENDED_TEST_CAMPAIGN.md  
**Fecha:** 4 de Noviembre de 2026  
**Rama de Trabajo:** `feat/zk-consensus-binding` (worktree aislado `.worktrees/zk-consensus-binding`)  
**Commit Base:** `origin/main` @ `9970e260d7a9e217aa711e61d0018ad283e6e26f`  
**Versión:** `0.13.0-rc.1`  
**Veredicto General:** **EXITOSO (100% DE PRUEBAS EJECUTADAS PASADAS)**  

---

## 1. RESUMEN GLOBAL DE EJECUCIÓN

| Categoría de Pruebas | Suite / Comando | Tests Totales | Pasados | Fallidos | Bloqueados / Omitidos | Duración | Código Salida |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **ZK Adversarial Suite** | `zk-adversarial-binding.test.ts` | 18 | 18 | 0 | 0 | 33 ms | 0 |
| **ZK Consensus Binding** | `zk-consensus-binding.test.ts` | 13 | 13 | 0 | 0 | 71 ms | 0 |
| **ZK Toccata L1 Builder** | `zk-toccata-phase3.test.ts` | 15 | 15 | 0 | 0 | 146 ms | 0 |
| **ZK Security Remediation**| `zk-remediation-1.test.ts` | 20 | 20 | 0 | 0 | 4.61 s | 0 |
| **ZK Pairing BN254 Math** | `zk-crypto-phase2.test.ts` | 10 | 10 | 0 | 0 | 4.00 s | 0 |
| **ZK Artifact Hardening** | `zk-security-phase1.test.ts` | 9 | 9 | 0 | 0 | 1.37 s | 0 |
| **ZK vProgs Inspect Parity**| `zk-vprogs-0-9-1.test.ts` | 9 | 9 | 0 | 0 | 3.39 s | 0 |
| **ZK CLI Subcommands** | `zk-cli.test.ts` | 14 | 14 | 0 | 0 | 22.03 s | 0 |
| **SilverScript / KCC20** | `pnpm test:silverc` (24 suites) | 112 | 112 | 0 | 0 | 42.10 s | 0 |
| **Monorepo Build** | `pnpm turbo build` (61 pkgs) | 46 tareas | 46 | 0 | 0 | 2m 55s | 0 |
| **Monorepo Typecheck** | `pnpm turbo typecheck` (61 pkgs)| 54 tareas | 54 | 0 | 0 | 1m 52s | 0 |
| **Simnet Live Broadcast** | `zk-toccata-l1.simnet.test.ts` | 1 | 0 | 0 | 1 (Blocked) | - | - |

> **Total acumulado de pruebas ZK directas:** **108 pruebas superadas (100% PASS)**.  
> **Total pruebas SilverScript v1.0.0:** **112 pruebas superadas (100% PASS)**.

---

## 2. RESOLUCIÓN DEL BLOQUEO DE SILVERSCRIPT (KCC20 REFERENCE)

Durante la auditoría inicial de `origin/main`, las pruebas marcadas con `*.silverc.test.ts` fueron clasificadas como bloqueadas debido a la ausencia del repositorio externo de contratos `kcc20-reference`.

### Procedimiento de Desbloqueo y Validación
1. Se clonó el repositorio de referencia oficial de SilverScript:
   - URL: `https://github.com/argent-lang/kcc20-reference`
   - Commit fijado: `27f8403fb2424cf9633e9bf0528e1d6d45dd6fe4`
   - Configuración: `core.autocrlf false`
2. Se estableció la variable de entorno:
   ```cmd
   set HARDKAS_TEST_KCC20_REFERENCE=C:\Users\jrodr\Documents\kaslabdevs\GitHub\HardKas-repo\.worktrees\kcc20-ref-temp
   ```
3. Se ejecutó `pnpm test:silverc`:
   - **Resultado:** **24 suites de prueba ejecutadas, 112 pruebas pasadas (0 fallidas)**.
   - **Capacidades validadas:** Compilación SilverScript v1.0.0 a Kaspa Script, generación de artefactos, parsing de AST, tipado de parámetros, validación de covenants Toccata y compatibilidad con `kaspad`.

---

## 3. SUITE ADVERSARIAL ZK (18 VECTORES DE COMPROBACIÓN)

Ejecutada en `packages/sdk/test/zk-adversarial-binding.test.ts`:

```text
✓ Vector 1: Valid proof + correct outputs passes both SDK checks and consensus evaluation (18ms)
✓ Vector 2: Valid proof + modified recipient address is REJECTED by consensus OpTxOutputSpk (3ms)
✓ Vector 3: Valid proof + modified payout amount is REJECTED by consensus OpTxOutputAmount (2ms)
✓ Vector 4: Valid proof + extra unauthorized output is REJECTED by consensus OpTxOutputCount (2ms)
✓ Vector 5: Valid proof + manipulated change address/amount is REJECTED by change SPK guard (5ms)
✓ Vector 6: Valid proof + fee below compute mass floor triggers mempool violation warning (1ms)
✓ Vector 7: Valid proof + altered output ordering is REJECTED by index 0 SPK match (5ms)
✓ Vector 8: Valid proof + wrong journal hash is caught by structural and node verification (1ms)
✓ Vector 9: Valid proof + wrong imageId is caught by script inspection (1ms)
✓ Vector 10: Invalid/forged proof bytes fail extraction or structural validation (1ms)
✓ Vector 11: Malformed proof bytes missing 128-byte push are rejected (1ms)
✓ Vector 12: Mismatching verification key is rejected in verification pipelines (1ms)
✓ Vector 13: Proof reuse across different UTXOs is REJECTED by consensus OpOutpointTxId (5ms)
✓ Vector 14: Proof reuse on already-spent UTXO is rejected by DAG UTXO spendability invariant (1ms)
✓ Vector 15: Post-signing field tampering alters transaction ID and invalidates P2SH commitment (1ms)
✓ Vector 16: Compute budget below required precompile limit is identified (1ms)
✓ Vector 17: Insufficient UTXO amount to cover fee and payout is rejected (1ms)
✓ Vector 18: Raw transaction constructed without SDK guards is fully rejected by L1 consensus introspection (2ms)
```

---

## 4. TABLA DE CLASIFICACIÓN DE CAPACIDADES Y GARANTÍAS

| Capacidad / Componente | Clasificación de Garantía | Prueba / Evidencia de Respaldo | Alcance Real y Limitaciones |
| :--- | :---: | :--- | :--- |
| **Groth16 BN254 Math Pairing** | `OFF-CHAIN VERIFIED` | `zk-crypto-phase2.test.ts` | Verificación matemática local mediante `snarkjs` / Arkworks. Detecta trapdoors (M-01/H-01). No interactúa con la red. |
| **Journal Output Commitment** | `OFF-CHAIN VERIFIED` | `zk-consensus-binding.test.ts` | Compromiso SHA-256 de dominio `HARDKAS_ZK_OUTPUT_BINDING_V1` (`HKZ1`). Autentica SPK, sompis y outpoint. |
| **Output Introspection Scripting** | `SCRIPT-VM VERIFIED` | `zk-consensus-binding.test.ts` | Ensamblado y parsing de `OpTxOutputCount`, `OpTxOutputSpk`, `OpTxOutputAmount`. Validado contra `kaspa-wasm 2.1.0`. |
| **Adversarial Defenses L1** | `SCRIPT-VM VERIFIED` | `zk-adversarial-binding.test.ts` | 18 ataques (desvíos, inflación, outputs espurios, cambio robado) rechazados por la semántica de la ScriptVM. |
| **Toccata V1 Tx Assembly** | `SCRIPT-VM VERIFIED` | `zk-toccata-phase3.test.ts` | Construcción de transacción V1 con compute budget, mass de computación y fee mínimo de mempool. |
| **SilverScript Compilación** | `SCRIPT-VM VERIFIED` | `test:silverc` (112 tests) | Invoca binario oficial `silverc v1.0.0`. Compila contratos a Kaspa Script y genera artefactos `.artifact.json`. |
| **Ejecución Simnet en Nodo Vivo** | `BLOCKED (INFRASTRUCTURE)` | `zk-toccata-l1.simnet.test.ts` | Bloqueado por inactividad de Docker Desktop / falta de binario `kaspad` compilado en Windows host. |
| **Broadcasting en Mainnet** | `BLOCKED BY POLICY` | `execution-guard.test.ts` | Bloqueado intencionalmente por políticas de seguridad del SDK (`BLOCKED_BY_POLICY`). HardKAS nunca transmite a mainnet sin confirmación manual. |

---

## 5. REPRODUCIBILIDAD Y SANIDAD DEL REPOSITORIO

- **Branch Aislada:** `feat/zk-consensus-binding` preservada en `.worktrees/zk-consensus-binding`.
- **Ramas Protegidas:** `main` y `develop` permanecieron en modo estrictamente de solo lectura y no fueron modificadas.
- **Sin Paquetes Publicados:** No se publicaron versiones ni se alteraron dependencias del registro npm.
- **Higiene de Archivos:** Se limpiaron los artefactos temporales y los caches de Vite/Turbo generados durante las pruebas locales.
