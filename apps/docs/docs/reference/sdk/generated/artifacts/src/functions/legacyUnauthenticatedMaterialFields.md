[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / legacyUnauthenticatedMaterialFields

# Function: legacyUnauthenticatedMaterialFields()

> **legacyUnauthenticatedMaterialFields**(`artifact`, `version`): `string`[]

Defined in: [packages/artifacts/src/canonical.ts:355](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/canonical.ts#L355)

Paths of fields present in `artifact` that a legacy hash version never
authenticated but the current version would. Reported by the verifier for
legacy artifacts (D-Q1.e / IC-4′.3) so a consumer knows exactly which values
it must not trust.

## Parameters

### artifact

`unknown`

### version

`number`

## Returns

`string`[]
