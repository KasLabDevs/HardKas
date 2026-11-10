[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / writeArtifact

# Function: writeArtifact()

> **writeArtifact**(`filePath`, `artifact`): `Promise`\<`string`\>

Defined in: [packages/artifacts/dist/index.d.ts:13421](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L13421)

Writes an artifact as JSON (atomically; through the store's gate when the target is inside an artifact store).
Returns the absolute path written (a directory target gets a file named after the artifact), so the caller can
announce the write (`emitArtifactWritten`, EVENT-LEDGER-2 D4). This function itself announces nothing.

## Parameters

### filePath

`string`

### artifact

`unknown`

## Returns

`Promise`\<`string`\>
