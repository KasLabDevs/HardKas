[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / generateMigrationReceipt

# Function: generateMigrationReceipt()

> **generateMigrationReceipt**(`oldArtifact`, `newArtifact`, `migrationId`): `any`

Defined in: [packages/artifacts/src/migration.ts:736](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/migration.ts#L736)

Generates an explicit MigrationReceipt connecting old artifact to new artifact.
Both hashes are RECOMPUTED under the versions the artifacts declare (never
trusted from a claim); the receipt's lineage is a valid hexadecimal child of
the source (N13).

## Parameters

### oldArtifact

[`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

### newArtifact

[`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

### migrationId

`string`

## Returns

`any`
