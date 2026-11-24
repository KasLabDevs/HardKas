[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / domainDigestVersionFor

# Function: domainDigestVersionFor()

> **domainDigestVersionFor**(`hashVersion`): [`DomainDigestVersion`](../type-aliases/DomainDigestVersion.md)

Defined in: [packages/artifacts/src/domain-digest.ts:53](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/domain-digest.ts#L53)

Which digest algorithm an artifact's domain digests use, selected by the
artifact's DECLARED hashVersion: ≤ 4 → the legacy digest, 5 → version 1.
An invalid declaration is an error, never a guess (IC-4′.2).

## Parameters

### hashVersion

`unknown`

## Returns

[`DomainDigestVersion`](../type-aliases/DomainDigestVersion.md)
