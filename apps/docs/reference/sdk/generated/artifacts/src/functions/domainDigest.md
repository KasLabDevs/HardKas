[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / domainDigest

# Function: domainDigest()

> **domainDigest**(`value`, `version?`): `string`

Defined in: [packages/artifacts/src/domain-digest.ts:33](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/domain-digest.ts#L33)

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
