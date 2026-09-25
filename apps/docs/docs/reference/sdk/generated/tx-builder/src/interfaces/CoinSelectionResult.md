[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / CoinSelectionResult

# Interface: CoinSelectionResult

Defined in: [packages/tx-builder/src/coin-selector.ts:23](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L23)

## Properties

### changeSompi

> `readonly` **changeSompi**: `bigint`

Defined in: [packages/tx-builder/src/coin-selector.ts:28](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L28)

***

### dustRejected

> `readonly` **dustRejected**: [`Utxo`](Utxo.md)[]

Defined in: [packages/tx-builder/src/coin-selector.ts:30](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L30)

***

### estimatedFeeSompi

> `readonly` **estimatedFeeSompi**: `bigint`

Defined in: [packages/tx-builder/src/coin-selector.ts:27](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L27)

***

### feeModel

> `readonly` **feeModel**: `"estimated-v1"`

Defined in: [packages/tx-builder/src/coin-selector.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L33)

***

### immatureRejected

> `readonly` **immatureRejected**: [`Utxo`](Utxo.md)[]

Defined in: [packages/tx-builder/src/coin-selector.ts:31](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L31)

***

### outputs

> `readonly` **outputs**: [`TxOutput`](TxOutput.md)[]

Defined in: [packages/tx-builder/src/coin-selector.ts:29](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L29)

***

### selectedUtxos

> `readonly` **selectedUtxos**: [`Utxo`](Utxo.md)[]

Defined in: [packages/tx-builder/src/coin-selector.ts:24](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L24)

***

### targetSompi

> `readonly` **targetSompi**: `bigint`

Defined in: [packages/tx-builder/src/coin-selector.ts:26](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L26)

***

### totalInputSompi

> `readonly` **totalInputSompi**: `bigint`

Defined in: [packages/tx-builder/src/coin-selector.ts:25](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L25)

***

### warnings

> `readonly` **warnings**: `string`[]

Defined in: [packages/tx-builder/src/coin-selector.ts:32](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L32)
