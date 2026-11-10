[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / HashVersionMigrationResult

# Interface: HashVersionMigrationResult

Defined in: [packages/artifacts/src/migration.ts:585](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/migration.ts#L585)

## Properties

### artifact

> **artifact**: [`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

Defined in: [packages/artifacts/src/migration.ts:587](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/migration.ts#L587)

The re-issued version-5 artifact (a NEW identity, child of the source).

***

### legacyClaims

> **legacyClaims**: [`LegacyClaims`](LegacyClaims.md)

Defined in: [packages/artifacts/src/migration.ts:593](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/migration.ts#L593)

The legacy-claims block carried by the re-issued artifact, if any field was stripped.

***

### receipt

> **receipt**: [`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

Defined in: [packages/artifacts/src/migration.ts:589](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/migration.ts#L589)

The MigrationReceipt linking source and re-issued artifact.

***

### source

> **source**: `VerifiedSource`

Defined in: [packages/artifacts/src/migration.ts:591](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/migration.ts#L591)

The verified source identity and version.

***

### stripped

> **stripped**: `string`[]

Defined in: [packages/artifacts/src/migration.ts:595](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/migration.ts#L595)

Paths of the source fields that were NOT re-issued as authenticated content.
