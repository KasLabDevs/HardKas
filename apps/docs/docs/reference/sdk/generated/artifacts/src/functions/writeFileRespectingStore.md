[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / writeFileRespectingStore

# Function: writeFileRespectingStore()

> **writeFileRespectingStore**(`filePath`, `data`, `plainWrite`): `Promise`\<`void`\>

Defined in: [packages/artifacts/src/store-mutation.ts:110](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store-mutation.ts#L110)

A write to a caller-chosen path (an `--out`, an export): through the gate when the path is inside an artifact store,
otherwise exactly the caller's own plain write.

## Parameters

### filePath

`string`

### data

`string` \| `Uint8Array`\<`ArrayBufferLike`\>

### plainWrite

() => `unknown`

## Returns

`Promise`\<`void`\>
