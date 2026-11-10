[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / v1EstimatedSerializedSize

# Function: v1EstimatedSerializedSize()

> **v1EstimatedSerializedSize**(`shape`): `bigint`

Defined in: [packages/tx-builder/src/v1-mass.ts:91](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-mass.ts#L91)

Estimated serialized size, mass/mod.rs `transaction_estimated_serialized_size` and the input/output helpers: the
sig-op count is not counted; a v1 input adds 2 bytes (compute budget) and an output with a covenant 34 (2 authorizing
input + 32 covenant id).

## Parameters

### shape

[`V1MassTxShape`](../interfaces/V1MassTxShape.md)

## Returns

`bigint`
