[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / migrateArtifact

# Function: migrateArtifact()

> **migrateArtifact**(`identity`, `targetVersion`): [`MigrationResult`](../interfaces/MigrationResult.md)

Defined in: [packages/core/src/semantics/migration.ts:34](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/migration.ts#L34)

Handles migrating an artifact to a newer schema version.
Currently, only schemaVersion: 1 exists as the baseline.

## Parameters

### identity

[`SemanticIdentity`](../interfaces/SemanticIdentity.md)

### targetVersion

`1`

## Returns

[`MigrationResult`](../interfaces/MigrationResult.md)
