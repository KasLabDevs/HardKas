[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / listWorkspaceStoreFilesSync

# Function: listWorkspaceStoreFilesSync()

> **listWorkspaceStoreFilesSync**(`workspaceRoot`): [`WorkspaceStoreFile`](../interfaces/WorkspaceStoreFile.md)[]

Defined in: [packages/artifacts/src/resolve.ts:192](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/resolve.ts#L192)

WORKSPACE-AUTHORITY-1 (WA-I1) · every `.json` regular file of the artifact store the resolver reads — the store root
and its canonical subdirectories, contained by real path, deduplicated, in a stable order — whether or not it parses.
The resolver keeps the parseable ones (`enumerateWorkspaceArtifactsSync`); the query projection indexes exactly this
set, so a file that does not parse is reported as corrupted instead of silently ignored.

## Parameters

### workspaceRoot

`string`

## Returns

[`WorkspaceStoreFile`](../interfaces/WorkspaceStoreFile.md)[]
