[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / calculateContentHash

# Function: calculateContentHash()

> **calculateContentHash**(`obj`, `version?`): `string`

Defined in: [packages/artifacts/src/canonical.ts:341](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/canonical.ts#L341)

Calculates a SHA-256 hash of the canonical JSON representation under `version`.
Producers pass the version they write into the artifact; everything else must
use [recomputeDeclaredContentHash](recomputeDeclaredContentHash.md).

## Parameters

### obj

`unknown`

### version?

`number` = `CURRENT_HASH_VERSION`

## Returns

`string`
