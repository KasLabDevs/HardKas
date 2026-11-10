[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / resolveArtifactHandle

# Function: resolveArtifactHandle()

> **resolveArtifactHandle**(`input`, `workspaceRoot`, `options?`): `Promise`\<[`ArtifactHandle`](../interfaces/ArtifactHandle.md)\>

Defined in: [packages/artifacts/src/artifact-handle.ts:70](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/artifact-handle.ts#L70)

Resolve an artifact from the accepted CLI-facing identity forms (see header).
Throws a typed ArtifactHandleError on every failure.

## Parameters

### input

`string`

### workspaceRoot

`string`

### options?

[`ResolveArtifactHandleOptions`](../interfaces/ResolveArtifactHandleOptions.md) = `{}`

## Returns

`Promise`\<[`ArtifactHandle`](../interfaces/ArtifactHandle.md)\>
