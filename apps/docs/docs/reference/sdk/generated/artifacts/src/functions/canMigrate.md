[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / canMigrate

# Function: canMigrate()

> **canMigrate**(`artifact`, `targetVersion?`): `boolean`

Defined in: [packages/artifacts/src/migration.ts:301](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/migration.ts#L301)

Checks whether a migration path exists from the artifact's current
version to the target version.

## Parameters

### artifact

[`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

The artifact payload to check

### targetVersion?

`string` = `ARTIFACT_VERSION`

The desired target version (defaults to ARTIFACT_VERSION)

## Returns

`boolean`

`true` if a migration path exists or the artifact is already at the target version
