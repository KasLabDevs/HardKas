[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / assertFeeWithinLimitInForce

# Function: assertFeeWithinLimitInForce()

> **assertFeeWithinLimitInForce**(`feeSompi`, `limit`, `stage`, `network?`): `void`

Defined in: [packages/tx-builder/src/fee-policy.ts:90](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/fee-policy.ts#L90)

FEE_EXCEEDS_MAX when `feeSompi` is above the limit in force; `stage` says where (plan, sign, send).

## Parameters

### feeSompi

`bigint`

### limit

[`FeeLimitInForce`](../interfaces/FeeLimitInForce.md)

### stage

`"sign"` \| `"send"` \| `"plan"`

### network?

`string`

## Returns

`void`
