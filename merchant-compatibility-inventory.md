> **INVALID EVIDENCE: do not cite.** The retired merchant-compatibility battery generated this file on 2026-11-04 (commit `b36117860`). Its PASS counts include rows that never executed the operation they name, and some of its statements are false. `logs/README.md` lists the rows and the reasons (audit 2026-11-06 HK-07 / SIM-12, counter-audit CA-EV-06). The file is kept unchanged below this note until the owner decides to remove it. The current battery is `scripts/run-merchant-compatibility-battery-v2.mjs`, and it writes each run to its own directory.

# Inventario Exhaustivo de Compatibilidad — merchant-demo-rc28

> **Proyecto bajo auditoría:** `D:\proyectos\merchant-demo-rc28`  
> **Repositorio de ejecución:** `c:\Users\jrodr\Documents\kaslabdevs\GitHub\HardKas-repo`  
> **Rama de trabajo:** `feat/phase6-simulator-integration`  
> **Fecha de inventario:** 2026-11-04  
> **Total de operaciones distintas descubiertas:** **58 operaciones** (distribuidas en 8 categorías funcionales)

---

## 1. Metodología de Descubrimiento

El inventario se ha elaborado mediante la inspección exhaustiva y recursiva de:
1. **Servidor HTTP del Merchant:** `D:\proyectos\merchant-demo-rc28\copy\server\index.mjs` (97 KB, 2,138 líneas de backend).
2. **Documentación de Comandos:** `D:\proyectos\merchant-demo-rc28\copy\COMANDOS.md` (217 líneas con cada comando, argumento y política).
3. **Escenarios de Escenario y Tests:** `copy/hardkas-workspace/test/golden-core.test.ts` (escenarios `payment` e `insufficient funds`).
4. **Contratos Inteligentes SilverScript y Covenants:** `contracts/signed-release.sil` y `contracts/counter.sil`.
5. **Scripts del Workspace y Nómina:** `scripts/report.ts` y `batches/payroll.json`.
6. **Scripts de Ejecución y Watchdogs:** `scripts/80-merch2.ps1`, `81-merch2-scene10-raw.ps1`, `71-direct.ps1`, `30-drive.mjs`, `55-direct-scene-commands.sh`.

---

## 2. Inventario Completo de Operaciones por Categoría

### Categoría 1: Nodo y Gestión de Red Local (localnet / simulator)

| ID | Operación / Comando | Archivo y Línea de Origen | Es Mutante | Entornos Soportados |
|---|---|---|:---:|---|
| `OP-01` | `localnet status` | `server/index.mjs:182` | No | Simulator, Simnet |
| `OP-02` | `localnet start --toccata` | `server/index.mjs:369` | Sí | Simulator, Simnet |
| `OP-04` | `localnet fund` | `server/index.mjs:403` | Sí | Simulator, Simnet |
| `OP-05` | `localnet stop --toccata` | `server/index.mjs:1821` | Sí | Simulator, Simnet |
| `OP-06` | `node status` | `server/index.mjs:1737` | No | Simulator, Simnet |
| `OP-07` | `node reset` | `server/index.mjs:1853` | Sí | Simulator, Simnet |
| `OP-08` | `node logs` | `COMANDOS.md:20` | No | Simulator, Simnet |

### Categoría 1b: Simulador en Memoria

| ID | Operación / Comando | Archivo y Línea de Origen | Es Mutante | Entornos Soportados |
|---|---|---|:---:|---|
| `OP-03` | `simulator start` | `commands/simulator.ts:12` | No | Simulator, Simnet |

### Categoría 2: Cuentas y Saldos (accounts)

| ID | Operación / Comando | Archivo y Línea de Origen | Es Mutante | Entornos Soportados |
|---|---|---|:---:|---|
| `OP-09` | `accounts list` | `server/index.mjs:377` | No | Simulator, Simnet |
| `OP-10` | `accounts real generate` | `server/index.mjs:386` | No | Simulator, Simnet |
| `OP-11` | `accounts balance` | `server/index.mjs:203` | No | Simulator, Simnet |
| `OP-12` | `sdk.accounts.resolve` | `golden-core.test.ts:25` | No | Simulator, Simnet |
| `OP-13` | `sdk.accounts.balance` | `golden-core.test.ts:48` | No | Simulator, Simnet |

### Categoría 3: Ciclo de Transacciones (Plan, Profile, Sign, Send, Wait)

| ID | Operación / Comando | Archivo y Línea de Origen | Es Mutante | Entornos Soportados |
|---|---|---|:---:|---|
| `OP-14` | `tx plan` | `server/index.mjs:662` | No | Simulator, Simnet |
| `OP-15` | `tx profile` | `server/index.mjs:628` | No | Simulator, Simnet |
| `OP-16` | `tx sign` | `server/index.mjs:694` | No | Simulator, Simnet |
| `OP-17` | `tx send (signed)` | `server/index.mjs:720` | Sí | Simulator, Simnet |
| `OP-18` | `tx send (short-form)` | `server/index.mjs:411` | Sí | Simulator, Simnet |
| `OP-19` | `tx wait` | `server/index.mjs:307` | No | Simulator, Simnet |
| `OP-20` | `tx status` | `server/index.mjs:801` | No | Simulator, Simnet |
| `OP-21` | `tx receipt` | `server/index.mjs:803` | No | Simulator, Simnet |
| `OP-22` | `tx batch` | `server/index.mjs:1682` | Sí | Simulator, Simnet |
| `OP-23` | `sdk.tx.plan` | `golden-core.test.ts:28` | No | Simulator, Simnet |
| `OP-24` | `sdk.tx.sign` | `golden-core.test.ts:33` | No | Simulator, Simnet |
| `OP-25` | `sdk.tx.send` | `golden-core.test.ts:37` | Sí | Simulator, Simnet |
| `OP-26` | `sdk.tx.observe` | `golden-core.test.ts:16` | No | Simulator, Simnet |
| `OP-27` | `sdk.tx.status` | `report.ts:35` | No | Simulator, Simnet |

### Categoría 4: SilverScript y Covenants Toccata

| ID | Operación / Comando | Archivo y Línea de Origen | Es Mutante | Entornos Soportados |
|---|---|---|:---:|---|
| `OP-28` | `silver compile` | `server/index.mjs:1146` | No | Simulator, Simnet |
| `OP-29` | `silver verify` | `server/index.mjs:1171` | No | Simulator, Simnet |
| `OP-30` | `silver deploy` | `server/index.mjs:1178` | Sí | Simulator, Simnet |
| `OP-31` | `silver spend (intruder)` | `server/index.mjs:1208` | Sí | Simulator, Simnet |
| `OP-32` | `silver spend (owner)` | `server/index.mjs:1217` | Sí | Simulator, Simnet |
| `OP-33` | `silver covenant genesis` | `server/index.mjs:1408` | Sí | Simulator, Simnet |
| `OP-34` | `silver covenant transition` | `server/index.mjs:1343` | Sí | Simulator, Simnet |
| `OP-35` | `deploy track` | `server/index.mjs:269` | No | Simulator, Simnet |
| `OP-36` | `deploy history` | `server/index.mjs:235` | No | Simulator, Simnet |

### Categoría 5: Evidencia, Linaje e Integridad Criptográfica

| ID | Operación / Comando | Archivo y Línea de Origen | Es Mutante | Entornos Soportados |
|---|---|---|:---:|---|
| `OP-37` | `evidence pack` | `server/index.mjs:837` | No | Simulator, Simnet |
| `OP-38` | `evidence verify` | `server/index.mjs:842` | No | Simulator, Simnet |
| `OP-39` | `verify (artifact)` | `server/index.mjs:755` | No | Simulator, Simnet |
| `OP-40` | `why` | `server/index.mjs:763` | No | Simulator, Simnet |
| `OP-41` | `artifact lineage` | `server/index.mjs:645` | No | Simulator, Simnet |
| `OP-42` | `artifact verify` | `server/index.mjs:1640` | No | Simulator, Simnet |
| `OP-43` | `explain --tx` | `server/index.mjs:787` | No | Simulator, Simnet |
| `OP-44` | `query tx` | `server/index.mjs:805` | No | Simulator, Simnet |
| `OP-45` | `query store rebuild` | `server/index.mjs:1619` | No | Simulator, Simnet |
| `OP-46` | `query store doctor` | `server/index.mjs:1621` | No | Simulator, Simnet |
| `OP-47` | `query artifacts list` | `server/index.mjs:1625` | No | Simulator, Simnet |
| `OP-48` | `query lineage orphans` | `server/index.mjs:1633` | No | Simulator, Simnet |
| `OP-49` | `security audit` | `server/index.mjs:1643` | No | Simulator, Simnet |
| `OP-50` | `ci verify` | `COMANDOS.md:94` | No | Simulator, Simnet |

### Categoría 6: Diagnóstico, Salud RPC y Toolchain

| ID | Operación / Comando | Archivo y Línea de Origen | Es Mutante | Entornos Soportados |
|---|---|---|:---:|---|
| `OP-51` | `doctor` | `server/index.mjs:1735` | No | Simulator, Simnet |
| `OP-52` | `rpc health` | `server/index.mjs:1739` | No | Simulator, Simnet |
| `OP-53` | `rpc doctor` | `server/index.mjs:1747` | No | Simulator, Simnet |
| `OP-54` | `toolchain status` | `server/index.mjs:224` | No | Simulator, Simnet |
| `OP-55` | `config networks` | `server/index.mjs:1754` | No | Simulator, Simnet |
| `OP-56` | `lock list` | `server/index.mjs:1756` | No | Simulator, Simnet |

### Categoría 7: Testing y Tareas de Verificación

| ID | Operación / Comando | Archivo y Línea de Origen | Es Mutante | Entornos Soportados |
|---|---|---|:---:|---|
| `OP-57` | `test --evidence` | `server/index.mjs:1550` | No | Simulator, Simnet |
| `OP-58` | `task balances` | `server/index.mjs:1785` | No | Simulator, Simnet |

