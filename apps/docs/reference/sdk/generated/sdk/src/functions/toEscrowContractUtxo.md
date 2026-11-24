[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / toEscrowContractUtxo

# Function: toEscrowContractUtxo()

> **toEscrowContractUtxo**(`entry`): `object`

Defined in: [packages/sdk/src/escrow.ts:221](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L221)

A node UTXO entry (or a recorded funding entry) as the SilverScript spend builders take it.

## Parameters

### entry

`any`

## Returns

`object`

### amountSompi

> **amountSompi**: `bigint`

### blockDaaScore

> **blockDaaScore**: `bigint`

### isCoinbase

> **isCoinbase**: `boolean` = `!!u.isCoinbase`

### outpoint

> **outpoint**: `object`

#### outpoint.index

> **index**: `number`

#### outpoint.transactionId

> **transactionId**: `any` = `entry.outpoint.transactionId`

### scriptPublicKey

> **scriptPublicKey**: `object`

#### scriptPublicKey.script

> **script**: `string`

#### scriptPublicKey.version

> **version**: `number`
