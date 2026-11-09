[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / generatorFeeRate

# Function: generatorFeeRate()

> **generatorFeeRate**(`feeRate`): `number`

Defined in: [packages/tx-builder/src/fee-policy.ts:40](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/fee-policy.ts#L40)

The fee rate the Generator is given for a requested rate: none at or below the relay minimum (it then charges the
minimum on the compute mass), the rate itself above it (priority, priced as the mempool ranks it).

## Parameters

### feeRate

`bigint`

## Returns

`number`
