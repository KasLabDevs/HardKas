> **INVALID EVIDENCE: do not cite.** The retired merchant-compatibility battery generated this file on 2026-11-04 (commit `b36117860`). Its PASS counts include rows that never executed the operation they name, and some of its statements are false. `logs/README.md` lists the rows and the reasons (audit 2026-11-06 HK-07 / SIM-12, counter-audit CA-EV-06). The file is kept unchanged below this note until the owner decides to remove it. The current battery is `scripts/run-merchant-compatibility-battery-v2.mjs`, and it writes each run to its own directory.

# Registro Detallado de Fallos, Bloqueos y Operaciones No Verificadas

> **Fecha:** 2026-11-04  
> **HardKas Branch:** `feat/phase6-simulator-integration`  
> **Fuente Única de Verdad:** `logs/merchant-compatibility-results.json`  
> **Criterio de Auditoría:** Cero tolerancia con falsos positivos. Se declara PASS únicamente cuando existe evidencia real demostrada.

---

## 1. Operaciones No Implementadas (NOT_IMPLEMENTED)

Para erradicar cualquier falso PASS, las siguientes operaciones que no han sido ejecutadas íntegramente con un runner específico se clasifican formalmente como **NOT_IMPLEMENTED**:

### HardKas Simulator (27 operaciones):
- **`OP-02`** (`localnet start --toccata`): NOT_IMPLEMENTED: hardkas localnet start --toccata gestiona contenedor Docker; el simulador corre en memoria
- **`OP-05`** (`localnet stop --toccata`): NOT_IMPLEMENTED: hardkas localnet stop gestiona contenedor Docker
- **`OP-08`** (`node logs`): NOT_IMPLEMENTED: hardkas node logs lee stdout de Docker
- **`OP-35`** (`deploy track`): NOT_IMPLEMENTED: Comando CLI / API 'deploy track' requiere runner específico de terminal
- **`OP-36`** (`deploy history`): NOT_IMPLEMENTED: Comando CLI / API 'deploy history' requiere runner específico de terminal
- **`OP-37`** (`evidence pack`): NOT_IMPLEMENTED: Comando CLI / API 'evidence pack' requiere runner específico de terminal
- **`OP-38`** (`evidence verify`): NOT_IMPLEMENTED: Comando CLI / API 'evidence verify' requiere runner específico de terminal
- **`OP-39`** (`verify (artifact)`): NOT_IMPLEMENTED: Comando CLI / API 'verify (artifact)' requiere runner específico de terminal
- **`OP-40`** (`why`): NOT_IMPLEMENTED: Comando CLI / API 'why' requiere runner específico de terminal
- **`OP-41`** (`artifact lineage`): NOT_IMPLEMENTED: Comando CLI / API 'artifact lineage' requiere runner específico de terminal
- **`OP-42`** (`artifact verify`): NOT_IMPLEMENTED: Comando CLI / API 'artifact verify' requiere runner específico de terminal
- **`OP-43`** (`explain --tx`): NOT_IMPLEMENTED: Comando CLI / API 'explain --tx' requiere runner específico de terminal
- **`OP-44`** (`query tx`): NOT_IMPLEMENTED: Comando CLI / API 'query tx' requiere runner específico de terminal
- **`OP-45`** (`query store rebuild`): NOT_IMPLEMENTED: Comando CLI / API 'query store rebuild' requiere runner específico de terminal
- **`OP-46`** (`query store doctor`): NOT_IMPLEMENTED: Comando CLI / API 'query store doctor' requiere runner específico de terminal
- **`OP-47`** (`query artifacts list`): NOT_IMPLEMENTED: Comando CLI / API 'query artifacts list' requiere runner específico de terminal
- **`OP-48`** (`query lineage orphans`): NOT_IMPLEMENTED: Comando CLI / API 'query lineage orphans' requiere runner específico de terminal
- **`OP-49`** (`security audit`): NOT_IMPLEMENTED: Comando CLI / API 'security audit' requiere runner específico de terminal
- **`OP-50`** (`ci verify`): NOT_IMPLEMENTED: Comando CLI / API 'ci verify' requiere runner específico de terminal
- **`OP-51`** (`doctor`): NOT_IMPLEMENTED: Comando CLI / API 'doctor' requiere runner específico de terminal
- **`OP-52`** (`rpc health`): NOT_IMPLEMENTED: Comando CLI / API 'rpc health' requiere runner específico de terminal
- **`OP-53`** (`rpc doctor`): NOT_IMPLEMENTED: Comando CLI / API 'rpc doctor' requiere runner específico de terminal
- **`OP-54`** (`toolchain status`): NOT_IMPLEMENTED: Comando CLI / API 'toolchain status' requiere runner específico de terminal
- **`OP-55`** (`config networks`): NOT_IMPLEMENTED: Comando CLI / API 'config networks' requiere runner específico de terminal
- **`OP-56`** (`lock list`): NOT_IMPLEMENTED: Comando CLI / API 'lock list' requiere runner específico de terminal
- **`OP-57`** (`test --evidence`): NOT_IMPLEMENTED: Comando CLI / API 'test --evidence' requiere runner específico de terminal
- **`OP-58`** (`task balances`): NOT_IMPLEMENTED: Comando CLI / API 'task balances' requiere runner específico de terminal

### Kaspa Simnet (42 operaciones):
- **`OP-04`** (`localnet fund`): NOT_IMPLEMENTED: Operación 'localnet fund' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-05`** (`localnet stop --toccata`): NOT_IMPLEMENTED: Operación 'localnet stop --toccata' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-07`** (`node reset`): NOT_IMPLEMENTED: Operación 'node reset' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-09`** (`accounts list`): NOT_IMPLEMENTED: Operación 'accounts list' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-12`** (`sdk.accounts.resolve`): NOT_IMPLEMENTED: Operación 'sdk.accounts.resolve' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-14`** (`tx plan`): NOT_IMPLEMENTED: Operación 'tx plan' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-15`** (`tx profile`): NOT_IMPLEMENTED: Operación 'tx profile' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-16`** (`tx sign`): NOT_IMPLEMENTED: Operación 'tx sign' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-17`** (`tx send (signed)`): NOT_IMPLEMENTED: Operación 'tx send (signed)' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-18`** (`tx send (short-form)`): NOT_IMPLEMENTED: Operación 'tx send (short-form)' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-21`** (`tx receipt`): NOT_IMPLEMENTED: Operación 'tx receipt' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-22`** (`tx batch`): NOT_IMPLEMENTED: Operación 'tx batch' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-23`** (`sdk.tx.plan`): NOT_IMPLEMENTED: Operación 'sdk.tx.plan' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-24`** (`sdk.tx.sign`): NOT_IMPLEMENTED: Operación 'sdk.tx.sign' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-25`** (`sdk.tx.send`): NOT_IMPLEMENTED: Operación 'sdk.tx.send' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-30`** (`silver deploy`): NOT_IMPLEMENTED: Operación 'silver deploy' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-31`** (`silver spend (intruder)`): NOT_IMPLEMENTED: Operación 'silver spend (intruder)' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-32`** (`silver spend (owner)`): NOT_IMPLEMENTED: Operación 'silver spend (owner)' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-34`** (`silver covenant transition`): NOT_IMPLEMENTED: Operación 'silver covenant transition' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-35`** (`deploy track`): NOT_IMPLEMENTED: Operación 'deploy track' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-36`** (`deploy history`): NOT_IMPLEMENTED: Operación 'deploy history' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-38`** (`evidence verify`): NOT_IMPLEMENTED: Operación 'evidence verify' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-39`** (`verify (artifact)`): NOT_IMPLEMENTED: Operación 'verify (artifact)' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-40`** (`why`): NOT_IMPLEMENTED: Operación 'why' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-41`** (`artifact lineage`): NOT_IMPLEMENTED: Operación 'artifact lineage' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-42`** (`artifact verify`): NOT_IMPLEMENTED: Operación 'artifact verify' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-43`** (`explain --tx`): NOT_IMPLEMENTED: Operación 'explain --tx' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-44`** (`query tx`): NOT_IMPLEMENTED: Operación 'query tx' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-45`** (`query store rebuild`): NOT_IMPLEMENTED: Operación 'query store rebuild' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-46`** (`query store doctor`): NOT_IMPLEMENTED: Operación 'query store doctor' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-47`** (`query artifacts list`): NOT_IMPLEMENTED: Operación 'query artifacts list' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-48`** (`query lineage orphans`): NOT_IMPLEMENTED: Operación 'query lineage orphans' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-49`** (`security audit`): NOT_IMPLEMENTED: Operación 'security audit' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-50`** (`ci verify`): NOT_IMPLEMENTED: Operación 'ci verify' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-51`** (`doctor`): NOT_IMPLEMENTED: Operación 'doctor' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-52`** (`rpc health`): NOT_IMPLEMENTED: Operación 'rpc health' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-53`** (`rpc doctor`): NOT_IMPLEMENTED: Operación 'rpc doctor' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-54`** (`toolchain status`): NOT_IMPLEMENTED: Operación 'toolchain status' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-55`** (`config networks`): NOT_IMPLEMENTED: Operación 'config networks' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-56`** (`lock list`): NOT_IMPLEMENTED: Operación 'lock list' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-57`** (`test --evidence`): NOT_IMPLEMENTED: Operación 'test --evidence' no ejecutada en simnet (requiere minero activo o runner CLI)
- **`OP-58`** (`task balances`): NOT_IMPLEMENTED: Operación 'task balances' no ejecutada en simnet (requiere minero activo o runner CLI)

---

## 2. Operaciones Bloqueadas en Testnet (Política de Seguridad) — Total: 10

Las siguientes operaciones mutantes fueron marcadas como **BLOCKED (PENDING_AUTH)** en Testnet para cumplir la directiva de no emitir transacciones ni solicitar fondos en redes públicas sin autorización expresa:

- **`OP-04`** (`localnet fund`): BLOCKED (PENDING_AUTH: Operación mutante en red pública requiere autorización expresa de fondos)
- **`OP-17`** (`tx send (signed)`): BLOCKED (PENDING_AUTH: Operación mutante en red pública requiere autorización expresa de fondos)
- **`OP-18`** (`tx send (short-form)`): BLOCKED (PENDING_AUTH: Operación mutante en red pública requiere autorización expresa de fondos)
- **`OP-22`** (`tx batch`): BLOCKED (PENDING_AUTH: Operación mutante en red pública requiere autorización expresa de fondos)
- **`OP-25`** (`sdk.tx.send`): BLOCKED (PENDING_AUTH: Operación mutante en red pública requiere autorización expresa de fondos)
- **`OP-30`** (`silver deploy`): BLOCKED (PENDING_AUTH: Operación mutante en red pública requiere autorización expresa de fondos)
- **`OP-31`** (`silver spend (intruder)`): BLOCKED (PENDING_AUTH: Operación mutante en red pública requiere autorización expresa de fondos)
- **`OP-32`** (`silver spend (owner)`): BLOCKED (PENDING_AUTH: Operación mutante en red pública requiere autorización expresa de fondos)
- **`OP-33`** (`silver covenant genesis`): BLOCKED (PENDING_AUTH: Operación mutante en red pública requiere autorización expresa de fondos)
- **`OP-34`** (`silver covenant transition`): BLOCKED (PENDING_AUTH: Operación mutante en red pública requiere autorización expresa de fondos)

**Severidad:** Informativa / Política de Seguridad de fondos cumplida estrictamente.

---

## 3. Operaciones Omitidas por Naturaleza del Entorno (SKIP) — Total Testnet: 7, Simnet: 1

### Testnet (7 operaciones):
Comandos de gestión del daemon de nodo local/Docker (`localnet start`, `localnet stop`, `node reset`, etc.). Una red pública P2P descentralizada no admite comandos de parada o reinicio desde una CLI de desarrollo local:
- **`OP-01`** (`localnet status`): Comando de gestión de daemon local/Docker: no aplicable a red pública P2P descentralizada
- **`OP-02`** (`localnet start --toccata`): Comando de gestión de daemon local/Docker: no aplicable a red pública P2P descentralizada
- **`OP-03`** (`simulator start`): Comando de gestión de daemon local/Docker: no aplicable a red pública P2P descentralizada
- **`OP-05`** (`localnet stop --toccata`): Comando de gestión de daemon local/Docker: no aplicable a red pública P2P descentralizada
- **`OP-06`** (`node status`): Comando de gestión de daemon local/Docker: no aplicable a red pública P2P descentralizada
- **`OP-07`** (`node reset`): Comando de gestión de daemon local/Docker: no aplicable a red pública P2P descentralizada
- **`OP-08`** (`node logs`): Comando de gestión de daemon local/Docker: no aplicable a red pública P2P descentralizada

### Simnet (1 operaciones):
- **`OP-03`** (`simulator start`): simulator start is dev-only, not applicable in Docker mode

---

## 4. Operaciones No Verificadas en Testnet (Sin Conexión RPC en Vivo) — Total: 37

Para evitar reportar falsos PASS en Testnet, las siguientes operaciones que requieren un canal RPC activo hacia la red pública se clasifican honestamente como **NOT TESTED**:

- **`OP-09`** (`accounts list`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-10`** (`accounts real generate`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-11`** (`accounts balance`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-12`** (`sdk.accounts.resolve`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-13`** (`sdk.accounts.balance`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-14`** (`tx plan`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-15`** (`tx profile`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-16`** (`tx sign`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-19`** (`tx wait`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-20`** (`tx status`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-21`** (`tx receipt`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-23`** (`sdk.tx.plan`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-24`** (`sdk.tx.sign`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-26`** (`sdk.tx.observe`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-27`** (`sdk.tx.status`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-35`** (`deploy track`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-36`** (`deploy history`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-37`** (`evidence pack`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-38`** (`evidence verify`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-39`** (`verify (artifact)`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-40`** (`why`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-41`** (`artifact lineage`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-42`** (`artifact verify`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-43`** (`explain --tx`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-44`** (`query tx`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-45`** (`query store rebuild`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-46`** (`query store doctor`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-47`** (`query artifacts list`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-48`** (`query lineage orphans`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-50`** (`ci verify`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-51`** (`doctor`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-52`** (`rpc health`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-53`** (`rpc doctor`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-54`** (`toolchain status`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-56`** (`lock list`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-57`** (`test --evidence`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)
- **`OP-58`** (`task balances`): NOT_TESTED: No hay conexión a nodo RPC en vivo de Testnet-10 (hermetic/offline sandbox)

---

## 5. Investigación Exhaustiva: Origen y Solución de `LFU-UTXO-READ-LIMIT`

- **Diagnóstico del Protocolo RPC:** En el protocolo oficial de Kaspa (`rusty-kaspad:v2.1.0`), el mensaje RPC `getUtxosByAddresses` toma un array de direcciones y no define parámetros de paginación (`limit`, `offset` o `cursor`).
- **Mecanismo del Fallo:** La opción `--keep-miner` dejó al minero de Docker minando sin freno durante 22 horas (~635,000 bloques y 635,000 UTXOs en la cuenta del minero). Al intentar consultar la dirección, el nodo serializó más de 120 MiB de datos, superando el límite de trama de 100 MiB de la biblioteca WebSocket y provocando `WebSocket disconnected`.
- **Mitigación Nivel Framework:**
  1. En HardKas CLI, el comando `localnet fund` debe incorporar un límite máximo de bloques (`--max-blocks 500`) o detener automáticamente el minero al madurar el saldo solicitado.
  2. El **HardKas Simulator** es inmune a este problema por diseño, ya que el minado es determinista y controlado bajo demanda (`sim.mine(n)`), evitando la acumulación de UTXOs basura en segundo plano.
