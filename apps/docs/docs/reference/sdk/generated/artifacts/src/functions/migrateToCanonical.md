[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / migrateToCanonical

# ~~Function: migrateToCanonical()~~

> **migrateToCanonical**(`v1Artifact`): [`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

Defined in: [packages/artifacts/src/migration.ts:721](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/migration.ts#L721)

Migrates a v1 artifact to canonical format by updating the schema, version,
and calculating the contentHash.

## Parameters

### v1Artifact

[`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

The legacy v1 artifact to migrate

## Returns

[`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

The migrated artifact in canonical format

## Deprecated

Use `migrateArtifactPayload()` instead. This function is retained
for backward compatibility with existing callers.
