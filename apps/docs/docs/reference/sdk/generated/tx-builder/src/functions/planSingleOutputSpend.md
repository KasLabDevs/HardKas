[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / planSingleOutputSpend

# Function: planSingleOutputSpend()

> **planSingleOutputSpend**(`input`): `object`

Defined in: [packages/tx-builder/src/index.ts:275](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L275)

Fee for spending `inputs` entirely into one output (sweep/consolidation):
the output is the inputs minus the fee, and its amount feeds storage mass,
so the fee is settled against the SDK for the transaction as built.

## Parameters

### input

#### feeRateSompiPerMass

`bigint`

#### inputs

readonly `object`[]

#### networkId?

`string`

#### toAddress

`string`

## Returns

`object`

### feeSompi

> **feeSompi**: `bigint`

### mass

> **mass**: `bigint`

### sendSompi

> **sendSompi**: `bigint`
