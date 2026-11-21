[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / distinctWorkspaceArtifactsSync

# Function: distinctWorkspaceArtifactsSync()

> **distinctWorkspaceArtifactsSync**(`workspaceRoot`): [`WorkspaceArtifactEntry`](../interfaces/WorkspaceArtifactEntry.md)[]

Defined in: [packages/artifacts/src/resolve.ts:275](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/resolve.ts#L275)

WORKSPACE-AUTHORITY-1 (C1) · the store's artifacts as distinct identities, which is what every count and list of
"artifacts" shows: one entry per verified identity, the copy `compareStoreCopies` puts first, and every entry that does
not verify on its own (it has no identity to share). In the resolver's order.

## Parameters

### workspaceRoot

`string`

## Returns

[`WorkspaceArtifactEntry`](../interfaces/WorkspaceArtifactEntry.md)[]
