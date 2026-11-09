[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / selectV1FeeInputs

# Function: selectV1FeeInputs()

> **selectV1FeeInputs**(`input`): [`V1FeeSelection`](../interfaces/V1FeeSelection.md)

Defined in: [packages/tx-builder/src/v1-fee-inputs.ts:38](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-fee-inputs.ts#L38)

The coins that cover `targetSompi` (the fee plus the smallest change the caller accepts). V1_FEE_INPUTS_INSUFFICIENT
when the candidates do not reach it.

## Parameters

### input

#### coins

readonly [`V1FeeCoin`](../interfaces/V1FeeCoin.md)[]

#### networkId

`string`

#### pendingOutpoints

`ReadonlySet`\<`string`\>

Outpoints ("txid:index") transactions in the node's mempool are spending (observePendingSpends).

#### targetSompi

`bigint`

#### virtualDaaScore

`bigint`

## Returns

[`V1FeeSelection`](../interfaces/V1FeeSelection.md)
