[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / recordEscrowSignature

# Function: recordEscrowSignature()

> **recordEscrowSignature**(`record`, `role`, `signature`, `policy`): `void`

Defined in: [packages/sdk/src/escrow.ts:526](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L526)

The role's signature in the record; READY_TO_RELEASE once every required signer signed.

## Parameters

### record

[`EscrowRecord`](../interfaces/EscrowRecord.md)

### role

`string`

### signature

`string`

### policy

#### requiredSigners

readonly `string`[]

## Returns

`void`
