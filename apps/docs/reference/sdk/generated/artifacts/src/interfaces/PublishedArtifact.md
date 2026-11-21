[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / PublishedArtifact

# Interface: PublishedArtifact

Defined in: [packages/artifacts/src/store.ts:75](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/store.ts#L75)

What publishing an artifact into the store did (EVIDENCE-TRUST-1, write-once).

## Properties

### artifact

> **artifact**: `any`

Defined in: [packages/artifacts/src/store.ts:79](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/store.ts#L79)

The artifact exactly as the store holds it: the earlier copy when the identity was already published.

***

### path

> **path**: `string`

Defined in: [packages/artifacts/src/store.ts:77](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/store.ts#L77)

The absolute path of the store entry.

***

### written

> **written**: `boolean`

Defined in: [packages/artifacts/src/store.ts:81](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/store.ts#L81)

false when nothing was written because the store already held this identity.
