[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / migrateArtifactPayload

# Function: migrateArtifactPayload()

> **migrateArtifactPayload**(`artifact`, `targetVersion?`, `options?`): [`MigrationResult`](../interfaces/MigrationResult.md)

Defined in: [packages/artifacts/src/migration.ts:291](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/migration.ts#L291)

Migrates an artifact payload from its current schema version to the
specified target version.

**Identity Preservation:**
- The original `contentHash` is preserved as `originalContentHash`
- The `lineage.rootArtifactId` is NEVER modified
- A new `contentHash` is computed after migration using `CURRENT_HASH_VERSION`

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

Error if no migration path exists

## Example

```typescript
const result = migrateArtifactPayload(legacyArtifact);
if (result.migrated) {
  console.log(`Migrated from ${result.appliedSteps[0].fromVersion}`);
  console.log(`Original hash preserved: ${result.originalContentHash}`);
}
```
