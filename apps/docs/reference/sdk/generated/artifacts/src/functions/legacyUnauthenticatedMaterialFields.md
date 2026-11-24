[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / legacyUnauthenticatedMaterialFields

# Function: legacyUnauthenticatedMaterialFields()

> **legacyUnauthenticatedMaterialFields**(`artifact`, `version`): `string`[]

Defined in: [packages/artifacts/src/canonical.ts:355](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/canonical.ts#L355)

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
