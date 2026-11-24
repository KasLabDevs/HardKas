[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / measureV1Mass

# Function: measureV1Mass()

> **measureV1Mass**(`shape`, `storage`): [`V1MassMeasure`](../interfaces/V1MassMeasure.md)

Defined in: [packages/tx-builder/src/v1-mass.ts:242](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-mass.ts#L242)

The node's masses and minimum relay fee of a transaction; storage mass from its spent and created UTXOs.

## Parameters

### shape

[`V1MassTxShape`](../interfaces/V1MassTxShape.md)

### storage

#### inputs

readonly [`V1StorageCell`](../interfaces/V1StorageCell.md)[]

#### outputs

readonly [`V1StorageCell`](../interfaces/V1StorageCell.md)[]

## Returns

[`V1MassMeasure`](../interfaces/V1MassMeasure.md)
