[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / resolveMaxFeeRate

# Function: resolveMaxFeeRate()

> **resolveMaxFeeRate**(`input?`): `bigint`

Defined in: [packages/tx-builder/src/fee-policy.ts:46](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/fee-policy.ts#L46)

The bound on a node-supplied fee rate: the caller's, else the workspace's `networks[<net>].maxFeeRate`, else the default.

## Parameters

### input?

#### config?

`unknown`

#### network?

`string`

#### override?

`unknown`

## Returns

`bigint`
