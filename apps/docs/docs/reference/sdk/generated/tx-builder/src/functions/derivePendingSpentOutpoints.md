[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / derivePendingSpentOutpoints

# Function: derivePendingSpentOutpoints()

> **derivePendingSpentOutpoints**(`response`, `address`): `object`

Defined in: [packages/tx-builder/src/pending-spends.ts:67](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/pending-spends.ts#L67)

The outpoints that `address`'s SENDING mempool transactions spend, from a raw
`getMempoolEntriesByAddresses` response (receiving entries never exclude anything).

## Parameters

### response

`unknown`

### address

`string`

## Returns

`object`

### outpoints

> **outpoints**: `Set`\<`string`\>

### sendingEntries

> **sendingEntries**: `number`
