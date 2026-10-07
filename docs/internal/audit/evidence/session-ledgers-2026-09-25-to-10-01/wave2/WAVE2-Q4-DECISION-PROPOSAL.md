# Q4 — Semántica operativa de estados de una transacción en Kaspa/HardKAS (propuesta para ratificar)

Estado: PROPUESTA. Q4 es una pregunta de contrato (Plan §9: **STOP si upstream no puede establecerse**). Upstream SÍ se ha establecido (sección 1). Nada de esto está implementado; Wave 2 (R-iii parte 2) arranca al ratificarse los puntos de la sección 6.

Alcance: L1 Kaspa (rusty-kaspa 2.x, Toccata). Fuera: Igra/L2, Silver/deployment (siguen el mismo patrón acción+observación, IC-2′.9, pero con hallazgos propios), simulador (namespace sintético, IC-2′.7).

## 1. Hechos upstream (rusty-kaspa, verificados 2026-09-26)

Fuentes: `consensus/core/src/config/{constants,bps,params}.rs`, `consensus/src/{processes/pruning,pipeline/virtual_processor/processor}.rs`, `rpc/core/src/model/{message,tx,mempool}.rs`, `rpc/grpc/core/proto/rpc.proto`, `rpc/service/src/service.rs`, `wallet/core/src/utxo/settings.rs` (master) y `constants.rs` en el tag **v2.0.1** (el mínimo que fija HardKAS): mismas constantes.

| Hecho | Valor / semántica | Fuente |
|---|---|---|
| Envío | `submitTransaction(tx, allowOrphan)` "submits a transaction to the mempool"; éxito = devuelve `transactionId`; rechazo = `RpcError::RejectedTransaction(txId, motivo)`. Es **local al nodo que responde**, no dice nada de otros nodos ni del DAG | rpc.proto, service.rs |
| Mempool | `getMempoolEntry(txId, includeOrphanPool, filterTransactionPool)` → `{ fee, transaction, isOrphan }`; ausente → `TransactionNotFound`. Local y transitorio | mempool.rs, service.rs |
| Aceptación | La aceptación de una tx la decide un **bloque de la cadena seleccionada (chain block)** sobre su mergeset. `getVirtualChainFromBlock(startHash, includeAcceptedTransactionIds, minConfirmationCount?)` → `removedChainBlockHashes`, `addedChainBlockHashes`, `acceptedTransactionIds[{ acceptingBlockHash, acceptedTransactionIds[] }]`. V2: `dataVerbosityLevel NONE|LOW|HIGH|FULL` y `chainBlockAcceptedTransactions[{ chainBlockHeader, acceptedTransactions[] }]`. Respuesta en lotes de `mergeset_size_limit × 10` | message.rs, rpc.proto, service.rs |
| Reversibilidad | Un chain block puede salir de la cadena seleccionada (`removedChainBlockHashes`): su aceptación deja de valer. Hasta finalidad, "aceptada" es **revertible** | processor.rs (`ChainPath.added/removed`) |
| Unidad de "confirmación" del nodo | `minConfirmationCount` se aplica como `sinkBlueScore − chainBlock.header.blueScore` (**blue score**, no DAA, no conteo de bloques) | service.rs |
| Finalidad | `finality_depth = BPS × FINALITY_DURATION(43_200 s) = 432 000` bloques a 10 BPS (≈12 h). El punto de finalidad del virtual es el chain block a esa profundidad (blue score) en la cadena seleccionada (o el pruning point si es más profundo). Un candidato cuyo pasado no contiene el punto de finalidad **se ignora de la cadena virtual** ("Finality Violation Detected… ignored from Virtual chain"): no hay reorg por debajo de él | bps.rs, constants.rs, processor.rs |
| Poda | `PRUNING_DURATION = 108 000 s` (≈30 h) → profundidad ≈1 080 000 bloques (fórmula en `bps.rs`). Por debajo del pruning point el nodo ya no sirve datos de aceptación: la observación deja de ser posible | constants.rs, pruning.rs |
| Merge depth | `MERGE_DEPTH_DURATION = 3600 s` → 36 000 bloques | constants.rs |
| Madurez (wallet de referencia) | coinbase 1000 DAA (`COINBASE_MATURITY_SECONDS 100 × 10 BPS`); tx de usuario **100 DAA** en mainnet/testnet-10/simnet (devnet 10). Medida en **DAA score**, no en blue score; es política del wallet, no consenso | settings.rs, bps.rs |
| Redes | mainnet, testnet-10, **simnet y devnet** usan `BlockrateParams::new::<10>()` (10 BPS, 100 ms); Crescendo activo (mainnet DAA 110 165 000, testnet 88 657 000, simnet/devnet `always`). El localnet de HardKAS (simnet, `skip_proof_of_work`) tiene por tanto las MISMAS profundidades: finalidad 432 000 bloques | params.rs |
| Observables de punto | `getBlockDagInfo` → `pruningPointHash`, `virtualDaaScore`, `sink`; `getSinkBlueScore` → blue score del sink; `getBlock(hash)` → cabecera con `blueScore`, `daaScore`; `getCurrentBlockColor(hash)` → azul/rojo | message.rs, rpc.proto |
| Sin índice de tx | El nodo no expone "estado de una tx por txId" (`getTransaction` de HardKAS depende de un índice externo; TxIndex upstream PR #860 sigue abierto). El estado se **deriva** de mempool + cadena virtual | kaspa-rpc de HardKAS, memoria de fuentes |

Divergencia interna actual de HardKAS (a corregir en Wave 2): `sdk.tx.waitForConfirmations` cuenta confirmaciones como `virtualDaaScore − daaScore(bloque aceptante)`; el toolkit (`query-api.ts`) usa `sinkBlueScore − blueScore(aceptante) + 1`; el nodo usa blue score sin `+1`. Tres unidades para la misma palabra.

## 2. Definiciones propuestas (estados derivados, nunca almacenados)

Todo estado es el resultado de `deriveTxStatus(submission, observations[], policyVersion)` (IC-2′.4). Cada estado declara **qué evidencia lo sostiene y quién la vio**.

| Estado | Definición operativa | Evidencia mínima | Reversible |
|---|---|---|---|
| `REJECTED_BY_NODE` | La submission registra `submitResult.accepted = false` (el nodo respondió `RejectedTransaction`) | `hardkas.txSubmission.v1` (ya autenticada, 1.3) | Sí en sentido débil: otra submission del mismo signed puede ser aceptada; el estado es por submission |
| `SUBMITTED` | La submission registra `submitResult.accepted = true` (el nodo devolvió el `txId`): el nodo que respondió la admitió en su mempool en ese instante | `hardkas.txSubmission.v1` | Sí (mempool local, transitorio) |
| `MEMPOOL_ACCEPTED` | Una observación `mempool_entry` con `isOrphan = false` en el observador E en el punto (sink, DAA) | `txObservation.v1 { finding: mempool_entry }` | Sí |
| `MEMPOOL_ORPHAN` | Observación `mempool_entry` con `isOrphan = true` (faltan padres): NO es aceptación | ídem | Sí |
| `ACCEPTED` | Observación `chain_accepted`: `txId ∈ acceptedTransactionIds` del chain block B (`acceptingBlockHash`), con `B.blueScore`, `B.daaScore` y el punto de observación (`sinkHash`, `sinkBlueScore`, `virtualDaaScore`); y ninguna observación posterior `chain_removed(B)` | `txObservation.v1 { finding: chain_accepted }` | **Sí, hasta finalidad** |
| `CONFIRMED(n)` | `ACCEPTED` con `confirmations = sinkBlueScore − B.blueScore ≥ policy.minConfirmations` en la observación más reciente en la que B sigue en la cadena seleccionada | ídem + `finding.confirmationsBlue` | Sí, hasta finalidad (probabilidad decreciente; sin garantía) |
| `FINALIZED` | `ACCEPTED` y `sinkBlueScore − B.blueScore ≥ finalityDepth(red)` con B todavía ancestro de cadena del sink (equivale a "B está en o bajo el punto de finalidad del virtual") | `txObservation.v1 { finding: finality_reached }` | **No** por protocolo (un reorg bajo el punto de finalidad se ignora) |
| `REORGED` | Existió `chain_accepted(B)` y después `chain_removed(B)` (B ∈ `removedChainBlockHashes` o B ya no es ancestro de cadena) sin una nueva aceptación observada | dos observaciones | Vuelve a `MEMPOOL_*`/`INSUFFICIENT` si se re-observa |
| `UNOBSERVABLE_PRUNED` | El bloque aceptante (o el `startHash` necesario) está bajo el pruning point del observador: la aceptación no puede re-observarse. El último estado durable registrado se conserva, marcado con la edad de su evidencia | `finding: pruned_unobservable` | — |
| `INSUFFICIENT_EVIDENCE` | Ninguna de las anteriores: p. ej. solo `SUBMITTED` sin observaciones, `mempool_absent` sin `chain_accepted`, observaciones caducadas según policy | — | — |
| `CONFLICTING_OBSERVATIONS` | Dos observaciones válidas incompatibles fuera de lo que explica un reorg: p. ej. dos `chain_accepted` con bloques aceptantes distintos ambos declarados en cadena en puntos comparables, o `finality_reached(B)` seguida de `chain_removed(B)` | — | — |

Reglas:
1. **Orden y monotonía**: `SUBMITTED → MEMPOOL_ACCEPTED → ACCEPTED → CONFIRMED(n) → FINALIZED`. Solo `FINALIZED` es terminal. `ACCEPTED`/`CONFIRMED` pueden retroceder (`REORGED`). `REJECTED_BY_NODE` es terminal por submission.
2. **Ausencia no es evidencia**: `mempool_absent` por sí sola no prueba nada (pudo aceptarse, expirar o no haber llegado). Solo sirve combinada.
3. **Unidad de confirmación = blue score** (la del nodo). El delta DAA se registra como `confirmationsDaa` para madurez/gastabilidad (política de wallet), nunca para decidir estado.
4. **Umbral por policy versionada**, no constante: `policy.minConfirmations` por red. Propuesta de defecto: **100** (≈10 s a 10 BPS, alineado con la madurez de tx de usuario del wallet de referencia); `finalityDepth` por red desde una tabla de parámetros derivada de upstream (mainnet/testnet-10/simnet/devnet: 432 000) versionada junto a `policyVersion`, con el `serverVersion` del observador registrado.
5. **Ventana de observabilidad**: `FINALIZED` solo puede observarse entre ≈12 h y ≈30 h tras la aceptación (antes de la poda). Un observador que no llegó a tiempo produce `UNOBSERVABLE_PRUNED`, nunca "finalizada por antigüedad".
6. **Localidad**: cada estado va con el observador (IC-2′.3). Dos observadores distintos que concuerdan refuerzan; uno solo nunca se presenta como "la red".
7. **Simulador**: solo `SYNTHETIC_EXECUTED` bajo el namespace sintético. Nunca `CONFIRMED`/`FINALIZED`; nunca "Consensus Validated".

## 3. Qué NO afirma este modelo

- No afirma que un nodo sea honesto ni que la vista del observador coincida con la red; registra qué nodo vio qué.
- No afirma finalidad económica ni "irreversible" para `CONFIRMED(n)` con ningún n < `finalityDepth`.
- No usa `getTransaction` (índice externo) como fuente de estado.
- No introduce estados para Silver/deployment/L2 (patrón igual, hallazgos distintos, olas posteriores).

## 4. Forma del artefacto de observación (`hardkas.txObservation.v1`, IC-2′.3)

Autenticado (v5): `subject { txId, submissionArtifactId? }`, `observer { networkId, serverVersion, capabilities: { reorgAware: boolean, prunedBelow?: hash } }`, `point { virtualDaaScore, sinkHash, sinkBlueScore, pruningPointHash }`, `finding` (unión discriminada: `mempool_entry{isOrphan,fee}` · `mempool_absent` · `chain_accepted{acceptingBlockHash, acceptingBlueScore, acceptingDaaScore, confirmationsBlue, confirmationsDaa}` · `chain_removed{acceptingBlockHash}` · `finality_reached{acceptingBlockHash, finalityDepth}` · `pruned_unobservable{reason}` · `not_found`), `evidence { method, params, responseDigest }` (digest de dominio de la respuesta cruda; la respuesta cruda opcional fuera del hash). No autenticado: `rpcUrl` (localizador crudo, IC-1′.1b), `observedAt`.
Las observaciones **referencian** la submission; no son eslabones de linaje (IC-2′.5). Lookups: `listObservationsByTxId` devuelve N (IC-2′.6).

**Bloqueo heredado**: el `endpoint` normalizado del observador sigue ARCHITECTURE_BLOCKED (D-Q1.a). Propuesta interina: `observer` autenticado por `{networkId, serverVersion}` + `rpcUrl` no autenticado; la atribución fuerte a un endpoint queda pendiente de esa decisión. No se diseña la normalización aquí.

## 5. Regresiones que fijan el contrato (T-RS, T-A14b, N10)

- T-RS-1: solo `SUBMITTED` (submission aceptada, sin observaciones) ⇒ `INSUFFICIENT_EVIDENCE`, nunca `CONFIRMED`.
- T-RS-2: `mempool_entry(isOrphan=true)` ⇒ `MEMPOOL_ORPHAN`, no `MEMPOOL_ACCEPTED`.
- T-RS-3: `chain_accepted(B)` con `sinkBlueScore − B.blueScore < minConfirmations` ⇒ `ACCEPTED`, no `CONFIRMED`; con `≥` ⇒ `CONFIRMED(n)`; el cómputo usa blue score (un caso con DAA delta alto y blue delta bajo no confirma).
- T-RS-4: `chain_accepted(B)` + `chain_removed(B)` ⇒ `REORGED`; una posterior `chain_accepted(B′)` ⇒ `ACCEPTED` con B′.
- T-RS-5: `finality_reached(B)` con profundidad ≥ `finalityDepth(red)` ⇒ `FINALIZED`; con profundidad menor la observación es inválida (no se escribe / `INSUFFICIENT`).
- T-RS-6: `finality_reached(B)` seguida de `chain_removed(B)` ⇒ `CONFLICTING_OBSERVATIONS` (el protocolo lo excluye: algo miente).
- T-RS-7: observador con `prunedBelow` por encima de B y sin observación durable previa ⇒ `UNOBSERVABLE_PRUNED`, nunca `FINALIZED`.
- T-RS-8: observaciones LEGACY (`authScope ≠ FULL`) no deciden (IC-2′.8).
- T-RS-9: el simulador nunca produce `CONFIRMED`/`FINALIZED`.
- T-A14b: `tx send` en red no imprime "Consensus Validated: YES"; imprime el estado derivado con su evidencia y observador, o `INSUFFICIENT_EVIDENCE`.
- T-N10: tipos TS ≡ enums Zod; `txReceipt.v2` sin productor se retira o se reetiqueta como observación.
- L3 (localnet, minero activo): plan → sign → send → observar hasta `CONFIRMED(100)` en segundos; `FINALIZED` NO es alcanzable en un test (12 h): se prueba la derivación con observaciones fijadas, no contra nodo.

## 6. Puntos a ratificar (responder por número: OK / cambio)

1. Nombres y orden de estados de la sección 2 (`REJECTED_BY_NODE, SUBMITTED, MEMPOOL_ACCEPTED, MEMPOOL_ORPHAN, ACCEPTED, CONFIRMED(n), FINALIZED, REORGED, UNOBSERVABLE_PRUNED, INSUFFICIENT_EVIDENCE, CONFLICTING_OBSERVATIONS`).
2. `ACCEPTED` como estado propio (aceptación por chain block, 0+ confirmaciones) separado de `CONFIRMED(n)`.
3. Unidad de confirmación = blue score (`sinkBlueScore − B.blueScore`, sin `+1`), DAA solo informativo.
4. `minConfirmations` por defecto = 100, en policy versionada por red.
5. `FINALIZED` = profundidad ≥ `finalityDepth` de la red (432 000 a 10 BPS) con B en cadena; tabla de parámetros derivada de upstream y versionada; `UNOBSERVABLE_PRUNED` tras la poda.
6. Observador autenticado por `{networkId, serverVersion, capabilities}` + `rpcUrl` no autenticado mientras el `endpoint` normalizado siga bloqueado (D-Q1.a).
7. Orden de implementación Wave 2: (a) `deriveTxStatus` + `txObservation.v1` + observadores RPC (mempool, cadena virtual, finalidad) con T-RS; (b) AUD-17/AUD-28 planner canónico; (c) AUD-19 pending-spend con evidencia de mempool; (d) AUD-18 fee real; (e) AUX-11; (f) T-A14b narrativas de red; (g) N10.

Si se ratifica tal cual, el siguiente paso es (a) con el modelo REPRODUCE → TEST FAILING → MINIMAL FIX → TARGETED PASS → FULL REGRESSION. Versión congelada en `0.12.0-rc.23`; sin commits por mi parte.
