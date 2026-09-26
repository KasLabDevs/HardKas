[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / canonicalStringify

# Function: canonicalStringify()

> **canonicalStringify**(`obj`, `version?`, `keyName?`, `isRoot?`): `string`

Defined in: [packages/artifacts/src/canonical.ts:96](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/canonical.ts#L96)

Deterministically stringifies an object by sorting keys recursively.
Handles BigInt by converting to string with type marker.
Excludes fields in SEMANTIC_EXCLUSIONS during serialization.
Skips keys with undefined values (matching JSON.stringify behavior).

## Parameters

### obj

`unknown`

### version?

`number` = `CURRENT_HASH_VERSION`

### keyName?

`string`

### isRoot?

`boolean` = `true`

## Returns

`string`
