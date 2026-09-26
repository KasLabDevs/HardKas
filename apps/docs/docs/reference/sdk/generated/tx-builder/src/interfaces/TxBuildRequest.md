[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / TxBuildRequest

# Interface: TxBuildRequest

Defined in: [packages/tx-builder/src/index.ts:44](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L44)

## Properties

### availableUtxos

> `readonly` **availableUtxos**: readonly [`Utxo`](Utxo.md)[]

Defined in: [packages/tx-builder/src/index.ts:47](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L47)

***

### changeAddress?

> `readonly` `optional` **changeAddress?**: `string`

Defined in: [packages/tx-builder/src/index.ts:49](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L49)

***

### coinbaseMaturity?

> `readonly` `optional` **coinbaseMaturity?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:62](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L62)

Coinbase maturity period in DAA blocks. Defaults to network specific value or 1000.

***

### computeBudget?

> `readonly` `optional` **computeBudget?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:54](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L54)

***

### computeGrams?

> `readonly` `optional` **computeGrams?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:55](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L55)

***

### feeOverrideSompi?

> `readonly` `optional` **feeOverrideSompi?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:72](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L72)

When provided, overrides the mass-based fee calculation with this exact fee. Used by the convergence loop when an external feeEstimator has already determined the fee.

***

### feePolicy?

> `readonly` `optional` **feePolicy?**: `"legacy"` \| `"toccata"` \| `"auto"`

Defined in: [packages/tx-builder/src/index.ts:67](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L67)

Fee calculation policy. Auto uses toccata if version >= 1 or if node supports it.

***

### feeRateSompiPerMass

> `readonly` **feeRateSompiPerMass**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:48](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L48)

***

### fromAddress

> `readonly` **fromAddress**: `string`

Defined in: [packages/tx-builder/src/index.ts:45](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L45)

***

### genesisCovenantGroups?

> `readonly` `optional` **genesisCovenantGroups?**: readonly `object`[]

Defined in: [packages/tx-builder/src/index.ts:69](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L69)

***

### lane?

> `readonly` `optional` **lane?**: `string`

Defined in: [packages/tx-builder/src/index.ts:57](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L57)

***

### networkId?

> `readonly` `optional` **networkId?**: `string`

Defined in: [packages/tx-builder/src/index.ts:64](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L64)

Network ID to determine default coinbase maturity.

***

### outputs

> `readonly` **outputs**: readonly [`TxOutput`](TxOutput.md)[]

Defined in: [packages/tx-builder/src/index.ts:46](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L46)

***

### payloadBytes?

> `readonly` `optional` **payloadBytes?**: `number`

Defined in: [packages/tx-builder/src/index.ts:50](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L50)

***

### storageMass?

> `readonly` `optional` **storageMass?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:56](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L56)

***

### version?

> `readonly` `optional` **version?**: `0` \| `1`

Defined in: [packages/tx-builder/src/index.ts:53](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L53)

***

### virtualDaaScore?

> `readonly` `optional` **virtualDaaScore?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:60](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/index.ts#L60)

Current virtual DAA score from the node. When provided, immature coinbase UTXOs are filtered out.
