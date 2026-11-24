[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / MigrationResult

# Interface: MigrationResult

Defined in: [packages/artifacts/src/migration.ts:46](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/migration.ts#L46)

Result of a migration operation.

## Properties

### appliedSteps

> **appliedSteps**: readonly `object`[]

Defined in: [packages/artifacts/src/migration.ts:54](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/migration.ts#L54)

Ordered list of migration steps that were applied

***

### artifact

> **artifact**: [`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

Defined in: [packages/artifacts/src/migration.ts:48](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/migration.ts#L48)

The migrated artifact payload

***

### migrated

> **migrated**: `boolean`

Defined in: [packages/artifacts/src/migration.ts:50](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/migration.ts#L50)

Whether any migration was actually applied

***

### originalContentHash

> **originalContentHash**: `string`

Defined in: [packages/artifacts/src/migration.ts:52](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/migration.ts#L52)

The original content hash (before migration), preserved for lineage
