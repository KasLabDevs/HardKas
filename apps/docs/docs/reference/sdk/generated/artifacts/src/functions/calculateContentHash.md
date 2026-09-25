[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / calculateContentHash

# Function: calculateContentHash()

> **calculateContentHash**(`obj`, `version?`): `string`

Defined in: [packages/artifacts/src/canonical.ts:184](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/canonical.ts#L184)

Calculates a SHA-256 hash of the canonical JSON representation.
Always excludes fields in SEMANTIC_EXCLUSIONS from the calculation.

## Parameters

### obj

`unknown`

### version?

`number` = `CURRENT_HASH_VERSION`

## Returns

`string`
