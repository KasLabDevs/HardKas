[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / storeEntryFor

# Function: storeEntryFor()

> **storeEntryFor**(`artifact`): `object`

Defined in: [packages/artifacts/src/store.ts:55](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store.ts#L55)

Where the store keeps an artifact (its path relative to `.hardkas/artifacts`) and the exact bytes it writes: the one
definition `writeArtifact` uses, shared with anything that must reproduce or recognise those bytes
(SIMULATOR-DURABLE-EXECUTION-1).

## Parameters

### artifact

`any`

## Returns

`object`

### content

> **content**: `string`

### rel

> **rel**: `string`
