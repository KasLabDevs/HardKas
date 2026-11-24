[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / findPublicR0TestVector

# Function: findPublicR0TestVector()

> **findPublicR0TestVector**(`imageId`, `_journalHash?`): `object`

Defined in: [packages/sdk/src/zk/risc0-groth16.ts:274](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/risc0-groth16.ts#L274)

The public program of an image id, or undefined. Matched on the image id only (C-1): a proof-only lock depends on the
image id alone, so a receipt of that program with ANY journal opens the address. `journalHash` is accepted for
compatibility and no longer narrows the match.

## Parameters

### imageId

`string`

### \_journalHash?

`string`

## Returns

`object`

### imageId

> `readonly` **imageId**: `string`

### journalHash

> `readonly` **journalHash**: `string`

### name

> `readonly` **name**: `string`
