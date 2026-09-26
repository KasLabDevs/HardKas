[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / verifyMigrationIntegrity

# Function: verifyMigrationIntegrity()

> **verifyMigrationIntegrity**(`preMigration`, `postMigration`): `void`

Defined in: [packages/core/src/semantics/migration.ts:13](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/migration.ts#L13)

Validates that an artifact migration preserves identity and lineage semantics.
Invariant: `schema_evolution_preserves_semantic_identity`

## Parameters

### preMigration

[`SemanticIdentity`](../interfaces/SemanticIdentity.md)

### postMigration

[`SemanticIdentity`](../interfaces/SemanticIdentity.md)

## Returns

`void`
