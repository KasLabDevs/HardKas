[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / canonicalStringifyUnexcluded

# Function: canonicalStringifyUnexcluded()

> **canonicalStringifyUnexcluded**(`obj`): `string`

Defined in: [packages/artifacts/src/canonical.ts:332](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/canonical.ts#L332)

The canonical form of a value with NO exclusions: every key at every depth,
sorted, with the current string/bigint rules. This is the input of the
domain-digest function (IC-1′.7); it is never an artifact's hash form.

## Parameters

### obj

`unknown`

## Returns

`string`
