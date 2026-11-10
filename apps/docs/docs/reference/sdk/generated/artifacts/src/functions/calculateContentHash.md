[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / calculateContentHash

# Function: calculateContentHash()

> **calculateContentHash**(`obj`, `version?`): `string`

Defined in: [packages/artifacts/src/canonical.ts:341](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/canonical.ts#L341)

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
