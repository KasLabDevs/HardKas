[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / covenantIdOf

# Function: covenantIdOf()

> **covenantIdOf**(`utxo`): `string`

Defined in: [packages/tx-builder/src/covenant-utxos.ts:22](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/covenant-utxos.ts#L22)

The covenant id a UTXO carries, if any, in every shape HardKAS handles: its own UTXOs and plan inputs
(`covenantId`), the node's JSON entries (`utxoEntry.covenantId`, snake case too) and kaspa-wasm references
(`entry.covenantId`).

## Parameters

### utxo

`unknown`

## Returns

`string`
