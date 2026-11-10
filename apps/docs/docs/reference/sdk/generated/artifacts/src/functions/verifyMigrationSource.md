[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / verifyMigrationSource

# Function: verifyMigrationSource()

> **verifyMigrationSource**(`source`): `VerifiedSource`

Defined in: [packages/artifacts/src/migration.ts:332](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/migration.ts#L332)

A migration starts from a VERIFIED source: its hashVersion must be a valid
declaration and its body must hash to the identity it claims under that
version. Nothing is re-issued from material that does not verify.

## Parameters

### source

[`ArtifactPayload`](../type-aliases/ArtifactPayload.md)

## Returns

`VerifiedSource`
