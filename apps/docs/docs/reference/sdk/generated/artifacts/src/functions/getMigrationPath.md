[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / getMigrationPath

# Function: getMigrationPath()

> **getMigrationPath**(`fromVersion`, `toVersion`): readonly [`MigrationStep`](../interfaces/MigrationStep.md)[]

Defined in: [packages/artifacts/src/migration.ts:253](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/migration.ts#L253)

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
