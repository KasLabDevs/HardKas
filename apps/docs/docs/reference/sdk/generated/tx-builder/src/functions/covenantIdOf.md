[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / covenantIdOf

# Function: covenantIdOf()

> **covenantIdOf**(`utxo`): `string`

Defined in: [packages/tx-builder/src/covenant-utxos.ts:22](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/covenant-utxos.ts#L22)

The covenant id a UTXO carries, if any, in every shape HardKAS handles: its own UTXOs and plan inputs
(`covenantId`), the node's JSON entries (`utxoEntry.covenantId`, snake case too) and kaspa-wasm references
(`entry.covenantId`).

## Parameters

### utxo

`unknown`

## Returns

`string`
