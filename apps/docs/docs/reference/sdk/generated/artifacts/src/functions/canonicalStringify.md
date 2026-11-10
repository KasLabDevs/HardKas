[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / canonicalStringify

# Function: canonicalStringify()

> **canonicalStringify**(`obj`, `version?`, `keyName?`, `isRoot?`): `string`

Defined in: [packages/artifacts/src/canonical.ts:317](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/canonical.ts#L317)

Deterministically stringifies an object by sorting keys recursively.
Handles BigInt by converting to string with type marker.
Versions 1–4 drop the version's exclusion set by key name at any depth
(legacy, frozen). Version 5 drops only the closed top-level list, the derived
labels and the exact-path self references.
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
