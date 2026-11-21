[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / escrowRefusalBody

# Function: escrowRefusalBody()

> **escrowRefusalBody**(`r`): `object`

Defined in: [packages/sdk/src/escrow.ts:156](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L156)

The dev server's HTTP body of a refusal: `{ ok: false, [code], error }`, as the routes always wrote it.

## Parameters

### r

[`EscrowRefusal`](../interfaces/EscrowRefusal.md)

## Returns

`object`

### code?

> `optional` **code?**: `string`

### error

> **error**: `string`

### ok

> **ok**: `false`
