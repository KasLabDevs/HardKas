[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / priorityFeeRate

# Function: priorityFeeRate()

> **priorityFeeRate**(`feeRate`): `bigint`

Defined in: [packages/tx-builder/src/fee-policy.ts:50](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/fee-policy.ts#L50)

G3 · the same rule for builders that price their own transaction (the v0 SilverScript and covenant builders): a rate
above the relay minimum buys priority, priced by the caller on the SDK's max(compute, storage) mass; a rate at or below
it (or none) is "pay the node's floor" (undefined), never the floor rate multiplied by the storage mass.

## Parameters

### feeRate

`bigint`

## Returns

`bigint`
