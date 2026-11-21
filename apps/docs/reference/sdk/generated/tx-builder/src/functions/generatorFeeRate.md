[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / generatorFeeRate

# Function: generatorFeeRate()

> **generatorFeeRate**(`feeRate`): `number`

Defined in: [packages/tx-builder/src/fee-policy.ts:40](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/fee-policy.ts#L40)

The fee rate the Generator is given for a requested rate: none at or below the relay minimum (it then charges the
minimum on the compute mass), the rate itself above it (priority, priced as the mempool ranks it).

## Parameters

### feeRate

`bigint`

## Returns

`number`
