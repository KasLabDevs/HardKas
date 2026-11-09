[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / distinctWorkspaceArtifactsSync

# Function: distinctWorkspaceArtifactsSync()

> **distinctWorkspaceArtifactsSync**(`workspaceRoot`): [`WorkspaceArtifactEntry`](../interfaces/WorkspaceArtifactEntry.md)[]

Defined in: [packages/artifacts/src/resolve.ts:275](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/resolve.ts#L275)

WORKSPACE-AUTHORITY-1 (C1) · the store's artifacts as distinct identities, which is what every count and list of
"artifacts" shows: one entry per verified identity, the copy `compareStoreCopies` puts first, and every entry that does
not verify on its own (it has no identity to share). In the resolver's order.

## Parameters

### workspaceRoot

`string`

## Returns

[`WorkspaceArtifactEntry`](../interfaces/WorkspaceArtifactEntry.md)[]
