[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / invalidEscrowReleaseSignature

# Function: invalidEscrowReleaseSignature()

> **invalidEscrowReleaseSignature**(`record`, `requiredSigners`, `finalized`): `string`

Defined in: [packages/sdk/src/escrow.ts:536](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L536)

Whether every signer the branch requires signed this spend: each signature valid (BIP340, SIGHASH_ALL) for the
finalized transaction, as it is sent, and the recorded funding output, by the key the escrow names for that role.
The reason it is not, otherwise.

## Parameters

### record

[`EscrowRecord`](../interfaces/EscrowRecord.md)

### requiredSigners

readonly `string`[]

### finalized

#### rpcTransaction

`any`

#### txId

`string`

## Returns

`string`
