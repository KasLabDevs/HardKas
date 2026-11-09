[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / migrateArtifactToHashVersion

# Function: migrateArtifactToHashVersion()

> **migrateArtifactToHashVersion**(`source`, `options`): [`HashVersionMigrationResult`](../interfaces/HashVersionMigrationResult.md)

Defined in: [packages/artifacts/src/migration.ts:603](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/migration.ts#L603)

Re-issues a legacy (hashVersion ≤ 4) artifact as a version-5 artifact plus a
MigrationReceipt (Closure Pack D-Q1.f / IC-4′.7). Nothing is rewritten in
place; the caller persists the two new artifacts.

## Parameters

### source

[`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

### options

[`HashVersionMigrationOptions`](../interfaces/HashVersionMigrationOptions.md)

## Returns

[`HashVersionMigrationResult`](../interfaces/HashVersionMigrationResult.md)
