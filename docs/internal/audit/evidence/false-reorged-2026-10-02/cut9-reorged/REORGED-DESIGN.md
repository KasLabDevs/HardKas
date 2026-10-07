# False REORGED in `tx wait` / `tx status` · investigation design (2026-10-02)

## Order (reviewer, relayed by the owner)

> Construir una transacción real en localnet, observar su secuencia real `mempool → confirmed`,
> registrar DAA/UTXO/txId durante todo el proceso y demostrar exactamente qué condición hace que
> `tx wait` diga `REORGED`. Antes de modificar nada, determinar si está confundiendo una desaparición
> temporal del mempool, un cambio de accepting block, una consulta RPC incompleta o un reorg real.
> Criterio de cierre: HardKAS jamás puede mostrar `REORGED` sin evidencia observable de que la
> transacción estuvo confirmada y posteriormente salió de la cadena canónica.

No repo change until the cause is proven and a GO is given.

## What the code says (read on HEAD 0f4c2f26b, nothing run yet)

Model: `sdk.tx.observe()` seals ONE `hardkas.txObservation.v1` per look (`observeTxOnce`,
packages/sdk/src/tx-observer.ts); `deriveTxStatus` (packages/artifacts/src/tx-status.ts) derives the
state from all persisted observations of one observer. `tx wait` (packages/cli/src/runners/tx-wait-runner.ts)
loops observe → derive until ACCEPTED/CONFIRMED (then a UTXO-view barrier) or timeout; it does not stop on
REORGED, it times out with "last derived state: REORGED".

REORGED (tx-status.ts:299-305): this observer saw `chain_accepted(A)` earlier, later `chain_removed(A)`,
and its latest finding is that removal, `not_found` or `mempool_absent` — "no new acceptance observed".

Hypothesis H1, two cooperating defects:
- **M1, observer (tx-observer.ts:223-236).** With a previous accepting block A, the observer asks
  `getVirtualChainFromBlock(A)`. If A is in `removedChainBlockHashes` it seals `chain_removed(A)` at once —
  without looking at the same response's `acceptedTransactionIds`, which cover the chain blocks just
  added. When the reorganisation that removed A also has a new chain block B accept the tx (frequent in a
  fast-mined DAG: the tx stays in the merged set, only the accepting chain block changes), the observer had
  the re-acceptance in hand and dropped it.
- **M2, cursor (tx.ts:151-161).** On the next look the derived state is REORGED, so there is no
  `previousAcceptingBlockHash`; the scan cursor is the latest observation's `point.sinkHash` (the sink of
  the look that saw the removal), which is at or after B. The scan only sees chain blocks added after the
  cursor, so B is never scanned; findings stay `not_found`; the derivation stays REORGED forever.
So the claim "REORGED" would be about the accepting BLOCK leaving the chain, not the TRANSACTION.

Alternatives to discriminate (the reviewer's list):
- H2 temporary mempool disappearance: by the derivation rules absence alone is `NO_CLAIM`, never
  REORGED — expected not to be a cause; measured anyway.
- H3 incomplete RPC query: scan window (`maxBatches`, cursor), or responses without
  `acceptedTransactionIds` — measured from the raw responses.
- H4 real reorg: at the moment of the claim no chain block on the current selected chain accepts the
  tx, and its outputs are not in the UTXO set.

## Measurement

Everything outside the repo; the repo's CLI at HEAD (built in an isolated worktree, as for 3c).
- A fresh HardKAS project; a funded sender; N real transfers (target 20) on the canonical localnet with
  fast mining (the demo saw ~1 in 3 with throttle 12 ms).
- Per tx, two concurrent loops from submission:
  1. **HardKAS, the user's flow:** `hardkas tx wait <txId> --until confirmed --interval 1 --timeout 120
     --json`; afterwards the observation artifacts it persisted (point, finding, raw-evidence digests) and
     `hardkas tx status <txId> --json`.
  2. **Truth recorder, independent of HardKAS code** (kaspa-wasm `RpcClient` directly), every ~250 ms:
     `getBlockDagInfo` (sink, virtual DAA), `getMempoolEntry(txId)`, `getVirtualChainFromBlock(start =
     the submit-time sink, includeAcceptedTransactionIds)` → the chain block of the CURRENT selected chain
     accepting txId (or none), `getUtxosByAddresses(sender, recipient)` → are txId's outputs in the UTXO
     set, `getBlock(accepting)` → blue score / DAA. Every raw response kept with its timestamp.

## Classification, fixed before measuring

For each tx and each moment t at which HardKAS's derived state is REORGED:
- **FALSE_REORGED** if at t, or at any later truth sample, a chain block on the then-current selected
  chain accepts txId, or txId's outputs are in the UTXO set.
- **TRUE_REORGED** only if at t no chain block on the current selected chain accepts txId AND its outputs
  are absent from the UTXO set, after it was accepted before.
Attribution of every FALSE_REORGED:
- **M1 proven** if the raw `getVirtualChainFromBlock(A)` response of the look that sealed
  `chain_removed(A)` lists a chain block B in `addedChainBlockHashes` whose `acceptedTransactionIds`
  contain txId.
- **M2 proven** if every later look scanned from a cursor at or after B (B precedes the cursor on the
  selected chain), so B could not be found.
- Anything else is reported as found, not forced into M1/M2.
Also counted: mempool disappearances before acceptance (H2), responses lacking accepted ids (H3), true
reorgs (H4). One record run; its first result is kept; harness faults are classified, not hidden.

## Closing criterion for a later fix (needs GO)

HardKAS never derives REORGED while a chain block on the observer's selected chain accepts the tx:
- deterministic regression with a scripted node for the exact sequence (A accepts → the diff from A
  removes A and adds B accepting the tx), failing on HEAD;
- the live run repeated: 0 FALSE_REORGED over N transfers with fast mining, every TRUE_REORGED (if any)
  backed by the truth recorder.

## Needs from the owner

The localnet: `hardkas-kaspad-toccata-v2` + `hardkas-toccata-miner` are running (started ~9 min before
this was written), likely for the demo. The run needs it for ~30 min with fast mining and a funded test
account; it is not started without the owner's OK.
