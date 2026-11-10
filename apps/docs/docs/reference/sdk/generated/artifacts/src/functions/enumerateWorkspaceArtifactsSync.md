[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / enumerateWorkspaceArtifactsSync

# Function: enumerateWorkspaceArtifactsSync()

> **enumerateWorkspaceArtifactsSync**(`workspaceRoot`): [`WorkspaceArtifactEntry`](../interfaces/WorkspaceArtifactEntry.md)[]

Defined in: [packages/artifacts/src/resolve.ts:234](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/resolve.ts#L234)

Every parseable `.json` artifact under `<workspaceRoot>/.hardkas/artifacts` (root
and canonical subdirectories), contained by real path, deduplicated, in a stable
order. Unparseable files are not artifacts and cannot claim an identity.

## Parameters

### workspaceRoot

`string`

## Returns

[`WorkspaceArtifactEntry`](../interfaces/WorkspaceArtifactEntry.md)[]
