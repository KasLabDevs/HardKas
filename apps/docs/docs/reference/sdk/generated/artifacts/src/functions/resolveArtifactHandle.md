[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / resolveArtifactHandle

# Function: resolveArtifactHandle()

> **resolveArtifactHandle**(`input`, `workspaceRoot`): `Promise`\<[`ArtifactHandle`](../interfaces/ArtifactHandle.md)\>

Defined in: [packages/artifacts/src/artifact-handle.ts:232](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/artifact-handle.ts#L232)

Resolve an artifact from the two accepted CLI-facing identity forms.

Accepted:
  - absolute or workspace-relative filesystem path to a .json artifact file
  - exact 64-hex lineage.artifactId

Anything else throws a typed ArtifactHandleError. See the file header
for the full contract.

## Parameters

### input

`string`

### workspaceRoot

`string`

## Returns

`Promise`\<[`ArtifactHandle`](../interfaces/ArtifactHandle.md)\>
