[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / assertFeeWithinLimitInForce

# Function: assertFeeWithinLimitInForce()

> **assertFeeWithinLimitInForce**(`feeSompi`, `limit`, `stage`, `network?`): `void`

Defined in: [packages/tx-builder/src/fee-policy.ts:81](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/fee-policy.ts#L81)

FEE_EXCEEDS_MAX when `feeSompi` is above the limit in force; `stage` says where (plan, sign, send).

## Parameters

### feeSompi

`bigint`

### limit

[`FeeLimitInForce`](../interfaces/FeeLimitInForce.md)

### stage

`"plan"` \| `"sign"` \| `"send"`

### network?

`string`

## Returns

`void`
