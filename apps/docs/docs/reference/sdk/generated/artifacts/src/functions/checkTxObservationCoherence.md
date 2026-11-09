[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / checkTxObservationCoherence

# Function: checkTxObservationCoherence()

> **checkTxObservationCoherence**(`observation`): [`TxObservationCoherence`](../type-aliases/TxObservationCoherence.md)

Defined in: [packages/artifacts/src/tx-observation.ts:34](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-observation.ts#L34)

Pure coherence rules of ONE observation against itself and the upstream
parameters (no store, no RPC):
 - `chain_accepted` / `finality_reached`: `confirmationsBlue = point.sinkBlueScore − acceptingBlueScore`;
 - `chain_accepted`: a `removedAcceptingBlockHash` is not the accepting block itself;
 - `finality_reached`: `finalityDepth` is the network's verified depth and `confirmationsBlue ≥ finalityDepth`;
 - `synthetic_executed` ⇔ `observer.kind = "synthetic"`;
 - `mempool_entry`/chain findings need an `rpc` observer;
 - `mempool_entry`: its chain window is all four fields or none (a partial window is not a verified one).

## Parameters

### observation

`unknown`

## Returns

[`TxObservationCoherence`](../type-aliases/TxObservationCoherence.md)
