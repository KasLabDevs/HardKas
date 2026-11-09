[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / countWorkspaceArtifactsSync

# Function: countWorkspaceArtifactsSync()

> **countWorkspaceArtifactsSync**(`workspaceRoot`): `object`

Defined in: [packages/artifacts/src/resolve.ts:291](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/resolve.ts#L291)

WORKSPACE-AUTHORITY-1 (C1) · what "Artifacts" counts: the distinct canonical identities among the store's entries (the
`tx plan` lattice copy of a plan is the same artifact as the plan). An entry that does not verify has no identity to
share and counts on its own, under its path. `entries` is the number of store files the resolver reads.

## Parameters

### workspaceRoot

`string`

## Returns

`object`

### artifacts

> **artifacts**: `number`

### entries

> **entries**: `number`

### unverified

> **unverified**: `number`
