[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / feeLimitInForce

# Function: feeLimitInForce()

> **feeLimitInForce**(`input`): [`FeeLimitInForce`](../interfaces/FeeLimitInForce.md)

Defined in: [packages/tx-builder/src/fee-policy.ts:84](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/fee-policy.ts#L84)

The fee limit in force: the lower of the plan's and the workspace's (`effectiveFeeLimit`), else DEFAULT_MAX_FEE_SOMPI.

## Parameters

### input

#### config?

`unknown`

#### network?

`string`

#### planMaxFeeSompi?

`unknown`

## Returns

[`FeeLimitInForce`](../interfaces/FeeLimitInForce.md)
