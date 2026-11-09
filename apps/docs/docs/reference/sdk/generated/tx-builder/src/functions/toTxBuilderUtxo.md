[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / toTxBuilderUtxo

# Function: toTxBuilderUtxo()

> **toTxBuilderUtxo**(`utxo`, `addressOverride?`): [`Utxo`](../interfaces/Utxo.md)

Defined in: [packages/tx-builder/src/utxo-mapper.ts:22](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/utxo-mapper.ts#L22)

Maps a flattened UTXO from WalletQuery (or similar APIs) into the hierarchical Utxo format required by TxBuilder.

## Parameters

### utxo

[`FlatUtxo`](../interfaces/FlatUtxo.md)

### addressOverride?

`string`

## Returns

[`Utxo`](../interfaces/Utxo.md)
