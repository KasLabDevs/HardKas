[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / CoinSelectionRequest

# Interface: CoinSelectionRequest

Defined in: [packages/tx-builder/src/coin-selector.ts:8](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L8)

## Properties

### changeAddress?

> `readonly` `optional` **changeAddress?**: `string`

Defined in: [packages/tx-builder/src/coin-selector.ts:13](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L13)

***

### coinbaseMaturity?

> `readonly` `optional` **coinbaseMaturity?**: `bigint`

Defined in: [packages/tx-builder/src/coin-selector.ts:18](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L18)

Coinbase maturity period in DAA blocks. Defaults to 1000.

***

### dustThresholdSompi?

> `readonly` `optional` **dustThresholdSompi?**: `bigint`

Defined in: [packages/tx-builder/src/coin-selector.ts:14](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L14)

***

### feeRateSompiPerMass

> `readonly` **feeRateSompiPerMass**: `bigint`

Defined in: [packages/tx-builder/src/coin-selector.ts:11](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L11)

***

### networkId?

> `readonly` `optional` **networkId?**: `string`

Defined in: [packages/tx-builder/src/coin-selector.ts:20](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L20)

Network ID to determine default coinbase maturity.

***

### strategy

> `readonly` **strategy**: [`CoinSelectionStrategy`](../type-aliases/CoinSelectionStrategy.md)

Defined in: [packages/tx-builder/src/coin-selector.ts:12](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L12)

***

### targetSompi

> `readonly` **targetSompi**: `bigint`

Defined in: [packages/tx-builder/src/coin-selector.ts:10](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L10)

***

### utxos

> `readonly` **utxos**: readonly [`Utxo`](Utxo.md)[]

Defined in: [packages/tx-builder/src/coin-selector.ts:9](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L9)

***

### virtualDaaScore?

> `readonly` `optional` **virtualDaaScore?**: `bigint`

Defined in: [packages/tx-builder/src/coin-selector.ts:16](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/coin-selector.ts#L16)

Current virtual DAA score from the node. When provided, immature coinbase UTXOs are filtered out.
