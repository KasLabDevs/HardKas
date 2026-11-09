[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / decodeKaspaAddress

# Function: decodeKaspaAddress()

> **decodeKaspaAddress**(`address`): `object`

Defined in: [packages/artifacts/src/submission-fee.ts:65](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/submission-fee.ts#L65)

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
