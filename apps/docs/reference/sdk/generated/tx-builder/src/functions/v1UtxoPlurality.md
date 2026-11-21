[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / v1UtxoPlurality

# Function: v1UtxoPlurality()

> **v1UtxoPlurality**(`scriptBytes`, `covenantId`): `bigint`

Defined in: [packages/tx-builder/src/v1-mass.ts:156](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-mass.ts#L156)

mass/mod.rs `utxo_plurality`: ⌈(63 + script bytes + 32 if it carries a covenant id) / 100⌉.

## Parameters

### scriptBytes

`number`

### covenantId

`boolean`

## Returns

`bigint`
