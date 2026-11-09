[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / migrateArtifactPayload

# Function: migrateArtifactPayload()

> **migrateArtifactPayload**(`artifact`, `targetVersion?`, `options?`): [`MigrationResult`](../interfaces/MigrationResult.md)

Defined in: [packages/artifacts/src/migration.ts:516](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/migration.ts#L516)

Migrates an artifact payload from its current schema version to the
specified target version.

**Identity (Closure Pack D-Q1.f / IC-4′.7):**
- The source is verified under the version it declares; a source that does
  not hash to its claimed identity is refused.
- The result is a NEW version-5 artifact whose lineage hangs from the
  verified source. Material fields the source never authenticated are moved
  to `legacyClaims`, never re-issued as authenticated content.

**Non-Destructive:**
- The input artifact object is never mutated
- The canonical artifact file on disk is never modified
- Migration produces a new in-memory representation only

## Parameters

### artifact

[`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

The artifact payload to migrate

### targetVersion?

`string` = `ARTIFACT_VERSION`

The desired target version (defaults to ARTIFACT_VERSION)

### options?

#### strictPolicy?

`boolean`

## Returns

[`MigrationResult`](../interfaces/MigrationResult.md)

MigrationResult with the migrated artifact and metadata

## Throws

Error if no migration path exists; MigrationError on a refusal
