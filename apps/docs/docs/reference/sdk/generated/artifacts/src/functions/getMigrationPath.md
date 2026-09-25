[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / getMigrationPath

# Function: getMigrationPath()

> **getMigrationPath**(`fromVersion`, `toVersion`): readonly [`MigrationStep`](../interfaces/MigrationStep.md)[]

Defined in: [packages/artifacts/src/migration.ts:196](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/migration.ts#L196)

Resolves the ordered list of migration steps needed to go from
`fromVersion` to `toVersion`.

Uses a simple BFS/chain walk through the migration registry.
Returns an empty array if no migration path exists or if the artifact
is already at the target version.

## Parameters

### fromVersion

`string`

The current artifact version

### toVersion

`string`

The desired target version

## Returns

readonly [`MigrationStep`](../interfaces/MigrationStep.md)[]

Ordered array of migration steps, or empty if no path or already current
