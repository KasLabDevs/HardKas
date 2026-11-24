[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / expectedScriptPublicKeyHex

# Function: expectedScriptPublicKeyHex()

> **expectedScriptPublicKeyHex**(`address`): `string`

Defined in: [packages/artifacts/src/submission-fee.ts:102](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/submission-fee.ts#L102)

The standard scriptPublicKey a Kaspa address denotes:
version 0 (Schnorr P2PK, 32 bytes) → `20 <key> ac`; version 1 (ECDSA P2PK, 33 bytes) →
`21 <key> ab`; version 8 (P2SH, 32 bytes) → `aa20 <hash> 87`. Undefined for anything else.

## Parameters

### address

`string`

## Returns

`string`
