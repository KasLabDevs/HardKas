[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / readNodeSet

# Function: readNodeSet()

> **readNodeSet**(`nodes`, `options`): `Promise`\<[`NodeSetReading`](../interfaces/NodeSetReading.md)\>

Defined in: [packages/sdk/src/multinode-read.ts:155](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L155)

Every node's identity, read in parallel, and its lag behind the most advanced usable node (`lagging` beyond
`lagThresholdDaa`, default 100). `expectedNetwork` is required: answers of different networks are never compared.

## Parameters

### nodes

readonly [`ReadNode`](../interfaces/ReadNode.md)[]

### options

#### expectedNetwork

`string`

#### lagThresholdDaa?

`bigint`

## Returns

`Promise`\<[`NodeSetReading`](../interfaces/NodeSetReading.md)\>
