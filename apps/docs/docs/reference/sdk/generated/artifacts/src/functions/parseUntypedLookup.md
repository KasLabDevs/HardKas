[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / parseUntypedLookup

# Function: parseUntypedLookup()

> **parseUntypedLookup**(`input`): [`LookupInput`](../type-aliases/LookupInput.md)

Defined in: [packages/artifacts/src/resolve.ts:153](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/resolve.ts#L153)

Turns an untyped string into a lookup: a contained path or a 64-hex artifactId
become `{ artifact }`; anything else needs its namespace (NAMESPACE_REQUIRED).

## Parameters

### input

`string`

## Returns

[`LookupInput`](../type-aliases/LookupInput.md)
