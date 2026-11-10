[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / observeTxAcrossNodes

# Function: observeTxAcrossNodes()

> **observeTxAcrossNodes**(`nodes`, `set`, `txId`, `options?`): `Promise`\<[`TxAcrossNodes`](../interfaces/TxAcrossNodes.md)\>

Defined in: [packages/sdk/src/multinode-read.ts:384](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L384)

One look per comparable node at `txId` (the SDK's observer: mempool, then the virtual chain from `since` — a chain
block every node should hold, e.g. the submission's submit point — else each node's pruning point), compared: nodes
whose chain accepted it, and which block; a node that has not, while its virtual DAA score is past the accepting
block's, disagrees (TX_ACCEPTANCE_DIFFERS); behind it, that is lag. Two accepting blocks are TX_ACCEPTING_BLOCK_DIFFERS
(their selected chains differ, e.g. during a reorg). Nothing is sent: a transaction a node does not hold is reported,
never handed to it.

## Parameters

### nodes

readonly [`ReadNode`](../interfaces/ReadNode.md)[]

### set

[`NodeSetReading`](../interfaces/NodeSetReading.md)

### txId

`string`

### options?

#### maxBatches?

`number`

#### since?

`string`

## Returns

`Promise`\<[`TxAcrossNodes`](../interfaces/TxAcrossNodes.md)\>
