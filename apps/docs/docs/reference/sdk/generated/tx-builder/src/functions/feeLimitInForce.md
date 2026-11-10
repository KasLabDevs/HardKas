[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / feeLimitInForce

# Function: feeLimitInForce()

> **feeLimitInForce**(`input`): [`FeeLimitInForce`](../interfaces/FeeLimitInForce.md)

Defined in: [packages/tx-builder/src/fee-policy.ts:75](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/fee-policy.ts#L75)

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
