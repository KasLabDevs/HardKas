[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / toTxBuilderUtxo

# Function: toTxBuilderUtxo()

> **toTxBuilderUtxo**(`utxo`, `addressOverride?`): [`Utxo`](../interfaces/Utxo.md)

Defined in: [packages/tx-builder/src/utxo-mapper.ts:17](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/utxo-mapper.ts#L17)

Maps a flattened UTXO from WalletQuery (or similar APIs) into the hierarchical Utxo format required by TxBuilder.

## Parameters

### utxo

[`FlatUtxo`](../interfaces/FlatUtxo.md)

### addressOverride?

`string`

## Returns

[`Utxo`](../interfaces/Utxo.md)
