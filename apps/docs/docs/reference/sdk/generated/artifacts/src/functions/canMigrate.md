[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / canMigrate

# Function: canMigrate()

> **canMigrate**(`artifact`, `targetVersion?`): `boolean`

Defined in: [packages/artifacts/src/migration.ts:244](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/migration.ts#L244)

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
