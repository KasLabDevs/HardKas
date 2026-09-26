[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / MigrationResult

# Interface: MigrationResult

Defined in: [packages/artifacts/src/migration.ts:39](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/migration.ts#L39)

Result of a migration operation.

## Properties

### appliedSteps

> **appliedSteps**: readonly `object`[]

Defined in: [packages/artifacts/src/migration.ts:47](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/migration.ts#L47)

Ordered list of migration steps that were applied

***

### artifact

> **artifact**: [`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

Defined in: [packages/artifacts/src/migration.ts:41](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/migration.ts#L41)

The migrated artifact payload

***

### migrated

> **migrated**: `boolean`

Defined in: [packages/artifacts/src/migration.ts:43](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/migration.ts#L43)

Whether any migration was actually applied

***

### originalContentHash

> **originalContentHash**: `string`

Defined in: [packages/artifacts/src/migration.ts:45](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/migration.ts#L45)

The original content hash (before migration), preserved for lineage
