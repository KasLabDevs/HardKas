[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / resolveMaxFeeRate

# Function: resolveMaxFeeRate()

> **resolveMaxFeeRate**(`input?`): `bigint`

Defined in: [packages/tx-builder/src/fee-policy.ts:55](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/fee-policy.ts#L55)

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
