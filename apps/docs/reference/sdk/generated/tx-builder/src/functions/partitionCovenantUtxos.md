[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / partitionCovenantUtxos

# Function: partitionCovenantUtxos()

> **partitionCovenantUtxos**\<`T`\>(`utxos`): `object`

Defined in: [packages/tx-builder/src/covenant-utxos.ts:41](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/covenant-utxos.ts#L41)

Splits UTXOs into those a payment may spend and those that belong to a covenant, each in the order given.

## Type Parameters

### T

`T`

## Parameters

### utxos

readonly `T`[]

## Returns

`object`

### covenant

> **covenant**: `T`[]

### spendable

> **spendable**: `T`[]
