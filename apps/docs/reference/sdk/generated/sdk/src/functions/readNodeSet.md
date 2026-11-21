[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / readNodeSet

# Function: readNodeSet()

> **readNodeSet**(`nodes`, `options`): `Promise`\<[`NodeSetReading`](../interfaces/NodeSetReading.md)\>

Defined in: [packages/sdk/src/multinode-read.ts:155](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L155)

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
