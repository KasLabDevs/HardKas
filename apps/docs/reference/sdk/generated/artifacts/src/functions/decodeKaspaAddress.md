[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / decodeKaspaAddress

# Function: decodeKaspaAddress()

> **decodeKaspaAddress**(`address`): `object`

Defined in: [packages/artifacts/src/submission-fee.ts:67](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/submission-fee.ts#L67)

Decodes a Kaspa bech32-style address into its version byte and payload (checksum not verified here: the node does).

## Parameters

### address

`string`

## Returns

`object`

### payload

> **payload**: `Uint8Array`

### prefix

> **prefix**: `string`

### version

> **version**: `number`
