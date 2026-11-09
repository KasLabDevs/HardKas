[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / compareUtxosAcrossNodes

# Function: compareUtxosAcrossNodes()

> **compareUtxosAcrossNodes**(`nodes`, `set`, `addresses`): `Promise`\<[`UtxoComparison`](../interfaces/UtxoComparison.md)\>

Defined in: [packages/sdk/src/multinode-read.ts:275](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L275)

The UTXOs of `addresses` at each comparable node (one read each, between two DAA scores), compared outpoint by
outpoint: the same entry everywhere (agreed), a different entry for one outpoint (UTXO_ENTRY_CONFLICT: consensus has
one entry per outpoint, so some node is wrong), or an outpoint some nodes list and others do not — lag when the DAA
scores account for it (a node not yet at the output's block, or listing nodes all behind the ones that no longer list
it), UTXO_PRESENCE_DISAGREES otherwise. A node without a UTXO index, or failing, is reported and left out.

## Parameters

### nodes

readonly [`ReadNode`](../interfaces/ReadNode.md)[]

### set

[`NodeSetReading`](../interfaces/NodeSetReading.md)

### addresses

readonly `string`[]

## Returns

`Promise`\<[`UtxoComparison`](../interfaces/UtxoComparison.md)\>
