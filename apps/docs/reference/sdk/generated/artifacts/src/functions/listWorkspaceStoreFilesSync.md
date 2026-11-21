[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / listWorkspaceStoreFilesSync

# Function: listWorkspaceStoreFilesSync()

> **listWorkspaceStoreFilesSync**(`workspaceRoot`): [`WorkspaceStoreFile`](../interfaces/WorkspaceStoreFile.md)[]

Defined in: [packages/artifacts/src/resolve.ts:192](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/resolve.ts#L192)

WORKSPACE-AUTHORITY-1 (WA-I1) · every `.json` regular file of the artifact store the resolver reads — the store root
and its canonical subdirectories, contained by real path, deduplicated, in a stable order — whether or not it parses.
The resolver keeps the parseable ones (`enumerateWorkspaceArtifactsSync`); the query projection indexes exactly this
set, so a file that does not parse is reported as corrupted instead of silently ignored.

## Parameters

### workspaceRoot

`string`

## Returns

[`WorkspaceStoreFile`](../interfaces/WorkspaceStoreFile.md)[]
