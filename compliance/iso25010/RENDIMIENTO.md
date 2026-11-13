# EVALUACIÓN DE EFICIENCIA DE DESEMPEÑO (`RENDIMIENTO.md`) — ISO/IEC 25010:2023

## 1. Resumen Ejecutivo de Rendimiento

 conforme a la característica **Eficiencia de Desempeño (Performance Efficiency)** de **ISO/IEC 25010:2023** (*Comportamiento Temporal*, *Utilización de Recursos* y *Capacidad*), HardKAS `v0.13.0-rc.2` presenta una arquitectura local-first optimizada para ciclos de desarrollo sub-segundo en memoria (`@hardkas/simulator`) y alta capacidad de procesamiento UTXO (`@hardkas/toolkit`), con límites explícitos de recursos tanto en fronteras WASM como en subprocesos criptográficos ZK.

- **Aspectos verificados (`VERIFICADO`)**:
  1. Ejecución determinista en memoria en sub-milisegundos (`@hardkas/simulator`, `HK-REQ-031`).
  2. Indexación en memoria y selección de monedas hasta **50.000 UTXOs** en `@hardkas/toolkit` (`benchmarks/utxo.bench.ts`, `HK-REQ-050`).
  3. Procesamiento por lotes y colas de hasta **10.000 trabajos** en `@hardkas/jobs` (`benchmarks/jobs.bench.ts`, `HK-REQ-052`).
  4. Aislamiento de CPU y memoria del verificador Groth16 mediante subprocesos con semáforo `MAX_CONCURRENT_PAIRINGS = 4` y timeout duro de **15,0 segundos** (`packages/sdk/src/zk/groth16-verifier.ts`, `HK-REQ-040`).
  5. Retroceso acotado en el BlockDAG (`tx wait --address`, por defecto **1.000 bloques**, tope duro de **10.000 bloques**, `HK-REQ-042`).
  6. Límites duros de memoria en la frontera FFI/WASM (**1 MB** para cadenas, **10 MB** para buffers binarios, **32 niveles** de profundidad JSON en `packages/core/src/wasm-boundary.ts`, `HK-REQ-003`).
- **Límites operativos y brechas detectadas (`PARCIAL` / `INCUMPLIDO`)**:
  1. **Desbordamiento de trama WebSocket wRPC (`100 MiB`) en sesiones `localnet` de larga duración sin consolidación (`LFU-UTXO-READ-LIMIT`, `HK-REQ-036` — `PARCIAL`)**.
  2. **Ausencia de limitación de tasa (rate limiting) en endpoints `/api/*` de `@hardkas/dev-server` (`HK-REQ-067` — `INCUMPLIDO`)**.
  3. **Ausencia de pool de conexiones en `@hardkas/plugin-rpc-backend` (`HK-REQ-057` — `PARCIAL`)**.

---

## 2. Análisis por Subcaracterística ISO/IEC 25010:2023

### 2.1 Comportamiento Temporal (Time Behaviour)

| Subsistema / Operación | Métrica / Límite de Diseño | Archivo de Referencia | Estado |
| :--- | :--- | :--- | :---: |
| **Simulador BlockDAG en memoria (`@hardkas/simulator`)** | Ejecución determinista de transacciones, validación de scripts y avance de reloj virtual sin latencia de red ni I/O de disco (< 5 ms por bloque simulado). | `packages/simulator/src/engine.ts#L1-L260` | `VERIFICADO` |
| **Verificación ZK Groth16 (`@hardkas/sdk/zk`)** | Timeout estricto de **15.000 ms (15,0 s)** por verificación de emparejamiento BN254 en subproceso aislado (`VERIFY_TIMEOUT_MS = 15_000`). | `packages/sdk/src/zk/groth16-verifier.ts#L156-L220` | `VERIFICADO` |
| **Convergencia iterativa de comisión y masa KIP-9 (`@hardkas/tx-builder`)** | Convergencia determinista en $\le 5$ iteraciones de punto fijo al calcular simultáneamente entradas, salida de cambio, masa de cómputo y masa de almacenamiento. | `packages/tx-builder/src/fee-mass.ts#L1-L240` | `VERIFICADO` |
| **Health check y arranque de `kaspad` (`@hardkas/localnet`)** | Sondeo escalonado de puertos gRPC/wRPC y estado del DAG con timeouts acotados y limpieza de procesos huérfanos. | `packages/localnet/src/manager.ts#L1-L280` | `VERIFICADO` |
| **Adquisición de locks de archivo (`@hardkas/core`)** | Backoff exponencial con detección y ruptura segura de locks obsoletos (stale lock breaking) verificando PID vivo. | `packages/core/src/locks.ts#L18-L195` | `VERIFICADO` |

### 2.2 Utilización de Recursos (Resource Utilization)

| Recurso Controlado | Límite Impuesto en Código | Archivo de Referencia | Estado |
| :--- | :--- | :--- | :---: |
| **Concurrencia de subprocesos ZK (`snarkjs`)** | Máximo **4 subprocesos simultáneos** (`MAX_CONCURRENT_PAIRINGS = 4`) para evitar agotamiento de RAM y CPU por verificaciones paralelas. | `packages/sdk/src/zk/groth16-verifier.ts#L160-L185` | `VERIFICADO` |
| **Memoria de trabajo Argon2id (Keystore KDF)** | Mínimo **19.456 KiB (~19 MiB)**, `iterations >= 2`, `parallelism >= 1`, con borrado `derivedKey.fill(0)` inmediato tras uso. | `packages/accounts/src/keystore.ts#L38-L62`, `#L168` | `VERIFICADO` |
| **Frontera WASM (`@hardkas/core`)** | Cadenas $\le 1\text{ MiB}$, buffers $\le 10\text{ MiB}$, profundidad de objetos $\le 32$. | `packages/core/src/wasm-boundary.ts#L28-L95` | `VERIFICADO` |
| **Tamaño de código fuente SilverScript** | Máximo **64 KiB (`65.536` bytes)** por contrato antes de invocar al compilador. | `packages/sdk/src/silver/compiler.ts#L20-L75` | `VERIFICADO` |
| **Masa de cómputo Toccata RISC Zero L1** | Presupuesto de cómputo `computeBudget >= 1550` y masa máxima `computeMass <= 500_000`. | `packages/sdk/src/zk/toccata.ts#L52-L100` | `VERIFICADO` |
| **Saltos de linaje en almacén de artefactos** | Máximo **64 saltos parentales** (`MAX_LINEAGE_PARENT_HOPS = 64`) para evitar bucles o agotamiento de pila. | `packages/artifacts/src/store.ts#L45-L90` | `VERIFICADO` |

### 2.3 Capacidad y Escalabilidad (Capacity)

1. **Suites de Benchmarks Verificadas (`benchmarks/*`)**:
   - `benchmarks/utxo.bench.ts#L1-L104`: Evalúa el indexador UTXO en memoria y los algoritmos de selección de monedas (`selectCoins`, análisis de polvo y planificación de consolidación) con **1.000, 10.000 y 50.000 UTXOs**.
   - `benchmarks/snapshot.bench.ts#L1-L58`: Evalúa la serialización, hash canónico y restauración de snapshots de estado del simulador y del toolkit.
   - `benchmarks/jobs.bench.ts#L1-L67`: Evalúa el rendimiento de encolado, persistencia de checkpoints y ejecución por lotes para **100, 1.000 y 10.000 trabajos** en `@hardkas/jobs`.
   - `benchmarks/docker-long-run.ts#L1-L92`: Evalúa la estabilidad de memoria RSS y latencia RPC durante ciclos continuos de minería y envío contra un contenedor `kaspad`.
2. **Límite de Capacidad en `localnet` (`LFU-UTXO-READ-LIMIT` — `HK-REQ-036`, `PARCIAL`)**:
   - Según se documenta en `docs/status/limitations.md#L365-L395` y se gestiona en `packages/kaspa-rpc/src/client.ts#L1-L260`, el servidor wRPC de `kaspad` impone un límite duro de **100 MiB por trama WebSocket**.
   - Cuando una dirección de minería `simnet` acumula cientos de miles de UTXOs coinbase sin consolidar, la llamada `getUtxosByAddresses` supera los 100 MiB y cierra el socket. HardKAS detecta esta condición y emite un diagnóstico guiado, pero requiere que las aplicaciones o el operador ejecuten barridos periódicos de consolidación UTXO (`@hardkas/toolkit`).
3. **Ausencia de Rate Limiting en `@hardkas/dev-server` (`HK-REQ-067` — `INCUMPLIDO`)**:
   - El servidor HTTP de desarrollo (`packages/dev-server/src/server.ts`) no limita el número de peticiones por minuto por IP en `/api/*`. Debe incorporarse un limitador en ventana deslizante ($\le 60\text{ req/min}$ por IP cuando se habilite `--unsafe-external`).
