[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / domainDigest

# Function: domainDigest()

> **domainDigest**(`value`, `version?`): `string`

Defined in: [packages/artifacts/src/domain-digest.ts:33](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/domain-digest.ts#L33)

SHA-256 of the unexcluded canonical form of `value`.
Version 1 is the only current algorithm; the function is versioned so a future
change is explicit in every caller.

## Parameters

### value

`unknown`

### version?

`number` = `CURRENT_DOMAIN_DIGEST_VERSION`

## Returns

`string`
