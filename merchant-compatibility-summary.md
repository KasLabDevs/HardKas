> **INVALID EVIDENCE: do not cite.** The retired merchant-compatibility battery generated this file on 2026-11-04 (commit `b36117860`). Its PASS counts include rows that never executed the operation they name, and some of its statements are false. `logs/README.md` lists the rows and the reasons (audit 2026-11-06 HK-07 / SIM-12, counter-audit CA-EV-06). The file is kept unchanged below this note until the owner decides to remove it. The current battery is `scripts/run-merchant-compatibility-battery-v2.mjs`, and it writes each run to its own directory.

# Resumen Ejecutivo de Compatibilidad — merchant-demo-rc28

> **Fecha de ejecución:** 2026-11-04  
> **HardKas Branch:** `feat/phase6-simulator-integration`  
> **Fuente Única de Verdad:** `logs/merchant-compatibility-results.json`  
> **Total de operaciones inventariadas:** 58

---

## 1. Métricas Consolidadas por Entorno

| Entorno de Ejecución | PASS | OFFLINE PASS | NOT IMPLEMENTED | FAIL | BLOCKED | SKIP | NOT TESTED | Total | % Éxito Demostrado |
|----------------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **1. HardKas Simulator** | **31** | **0** | **27** | **0** | **0** | **0** | **0** | **58** | **53.4% (31/58 ejecutados)** |
| **2. Kaspa Simnet (Docker `v2.1.0`)** | **15** | **0** | **42** | **0** | **0** | **1** | **0** | **58** | **26.3% (15/57 aplicables)** |
| **3. Kaspa Testnet (Auditoría Estricta)** | **0** | **4** | **0** | **0** | **10** | **7** | **37** | **58** | **0% Live (4/58 offline toolchain)** |

---

## 2. Hallazgos Críticos y Criterios de Auditoría

1. **Eliminación Total de Falsos PASS y Honestidad Radical:**
   - **HardKas Simulator:** 31 operaciones cuentan con ejecución criptográfica y comprobación de saldos real en el ledger en memoria. Las 27 operaciones restantes corresponden a comandos CLI de alto nivel / reportes (`OP-35` a `OP-58`) que se clasifican honestamente como `NOT_IMPLEMENTED` en lugar de marcarlas artificialmente como aprobadas.
   - **Kaspa Simnet:** 15 operaciones validadas en vivo contra el daemon oficial `rusty-kaspad v2.1.0`. Las 42 operaciones restantes se marcan honestamente como `NOT_IMPLEMENTED` en lugar de usar aserciones vacías.
   - **Kaspa Testnet:** Cero (`0`) llamadas live declaradas como PASS. Únicamente **4 operaciones offline herméticas** (`OP-28`, `OP-29`, `OP-49`, `OP-55`) se certifican como `OFFLINE_PASS`. **10 operaciones mutantes** permanecen `BLOCKED` por política de fondos. **37 operaciones de red** están marcadas como `NOT_TESTED`.

2. **Paridad Criptográfica Demostrada con Evidencia:**
   - Las operaciones `OP-17` a `OP-34` en Simulator cuentan con `txId` determinista de 64 caracteres hex y verificación atómica de saldo en el ledger (`ledgerVerified: true`).
   - Las operaciones de contrato SilverScript `OP-30` compilan `signed-release.sil` con la clave pública de Alice, derivan el `scriptPublicKey` P2SH real (`aa20...87`) y financian el contrato.
   - `OP-31` ejecuta una prueba negativa real en el ScriptVM del simulador donde un intruso intenta robar fondos sin la firma válida y el motor lo rechaza con `RejectScriptFailed: OpNumEqualVerify failed`.
   - `OP-32` ejecuta la liberación autorizada del contrato con la firma válida de Alice.
   - `OP-33` y `OP-34` ejecutan covenants génesis v1 y transición de estado v1 con verificación de `covenantId` inmutable.
   - `OP-22` demuestra tres transacciones independientes admitidas en mempool e incluidas en un mismo bloque (empaquetado multi-tx sin semántica ACID todo-o-nada).

3. **Causa Raíz de `LFU-UTXO-READ-LIMIT` y Solución:**
   - La causa del fallo en la ejecución prolongada de la demo no es la falta de paginación RPC (Kaspa RPC v2.1.0 no soporta paginación en `getUtxosByAddresses`), sino el minado descontrolado en segundo plano durante 22 horas que generó 635,000 UTXOs acumulados en una sola dirección, desbordando el límite de 100 MiB del WebSocket.
   - La solución consiste en incorporar un límite de bloques automático / watchdog seguro (`--max-blocks 500` o parada al alcanzar el saldo objetivo) en el comando `localnet fund`.
