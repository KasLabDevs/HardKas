[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / TxBuildRequest

# Interface: TxBuildRequest

Defined in: [packages/tx-builder/src/index.ts:51](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L51)

## Properties

### availableUtxos

> `readonly` **availableUtxos**: readonly [`Utxo`](Utxo.md)[]

Defined in: [packages/tx-builder/src/index.ts:54](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L54)

***

### changeAddress?

> `readonly` `optional` **changeAddress?**: `string`

Defined in: [packages/tx-builder/src/index.ts:56](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L56)

***

### coinbaseMaturity?

> `readonly` `optional` **coinbaseMaturity?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:69](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L69)

Coinbase maturity period in DAA blocks. Defaults to network specific value or 1000.

***

### computeBudget?

> `readonly` `optional` **computeBudget?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:61](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L61)

***

### computeGrams?

> `readonly` `optional` **computeGrams?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:62](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L62)

***

### feeOverrideSompi?

> `readonly` `optional` **feeOverrideSompi?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:79](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L79)

When provided, overrides the mass-based fee calculation with this exact fee. Used by the convergence loop when an external feeEstimator has already determined the fee.

***

### feePolicy?

> `readonly` `optional` **feePolicy?**: `"legacy"` \| `"toccata"` \| `"auto"`

Defined in: [packages/tx-builder/src/index.ts:74](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L74)

Fee calculation policy. Auto uses toccata if version \>= 1 or if node supports it.

***

### feeRateSompiPerMass

> `readonly` **feeRateSompiPerMass**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:55](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L55)

***

### fromAddress

> `readonly` **fromAddress**: `string`

Defined in: [packages/tx-builder/src/index.ts:52](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L52)

***

### genesisCovenantGroups?

> `readonly` `optional` **genesisCovenantGroups?**: readonly `object`[]

Defined in: [packages/tx-builder/src/index.ts:76](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L76)

***

### lane?

> `readonly` `optional` **lane?**: `string`

Defined in: [packages/tx-builder/src/index.ts:64](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L64)

***

### networkId?

> `readonly` `optional` **networkId?**: `string`

Defined in: [packages/tx-builder/src/index.ts:71](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L71)

Network ID to determine default coinbase maturity.

***

### outputs

> `readonly` **outputs**: readonly [`TxOutput`](TxOutput.md)[]

Defined in: [packages/tx-builder/src/index.ts:53](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L53)

***

### payloadBytes?

> `readonly` `optional` **payloadBytes?**: `number`

Defined in: [packages/tx-builder/src/index.ts:57](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L57)

***

### storageMass?

> `readonly` `optional` **storageMass?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:63](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L63)

***

### version?

> `readonly` `optional` **version?**: `0` \| `1`

Defined in: [packages/tx-builder/src/index.ts:60](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L60)

***

### virtualDaaScore?

> `readonly` `optional` **virtualDaaScore?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:67](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/index.ts#L67)

Current virtual DAA score from the node. When provided, immature coinbase UTXOs are filtered out.
