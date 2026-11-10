[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / TxBuildRequest

# Interface: TxBuildRequest

Defined in: [packages/tx-builder/src/index.ts:49](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L49)

## Properties

### availableUtxos

> `readonly` **availableUtxos**: readonly [`Utxo`](Utxo.md)[]

Defined in: [packages/tx-builder/src/index.ts:52](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L52)

***

### changeAddress?

> `readonly` `optional` **changeAddress?**: `string`

Defined in: [packages/tx-builder/src/index.ts:54](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L54)

***

### coinbaseMaturity?

> `readonly` `optional` **coinbaseMaturity?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:67](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L67)

Coinbase maturity period in DAA blocks. Defaults to network specific value or 1000.

***

### computeBudget?

> `readonly` `optional` **computeBudget?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:59](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L59)

***

### computeGrams?

> `readonly` `optional` **computeGrams?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:60](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L60)

***

### feeOverrideSompi?

> `readonly` `optional` **feeOverrideSompi?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:77](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L77)

When provided, overrides the mass-based fee calculation with this exact fee. Used by the convergence loop when an external feeEstimator has already determined the fee.

***

### feePolicy?

> `readonly` `optional` **feePolicy?**: `"legacy"` \| `"toccata"` \| `"auto"`

Defined in: [packages/tx-builder/src/index.ts:72](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L72)

Fee calculation policy. Auto uses toccata if version \>= 1 or if node supports it.

***

### feeRateSompiPerMass

> `readonly` **feeRateSompiPerMass**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:53](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L53)

***

### fromAddress

> `readonly` **fromAddress**: `string`

Defined in: [packages/tx-builder/src/index.ts:50](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L50)

***

### genesisCovenantGroups?

> `readonly` `optional` **genesisCovenantGroups?**: readonly `object`[]

Defined in: [packages/tx-builder/src/index.ts:74](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L74)

***

### lane?

> `readonly` `optional` **lane?**: `string`

Defined in: [packages/tx-builder/src/index.ts:62](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L62)

***

### networkId?

> `readonly` `optional` **networkId?**: `string`

Defined in: [packages/tx-builder/src/index.ts:69](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L69)

Network ID to determine default coinbase maturity.

***

### outputs

> `readonly` **outputs**: readonly [`TxOutput`](TxOutput.md)[]

Defined in: [packages/tx-builder/src/index.ts:51](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L51)

***

### payloadBytes?

> `readonly` `optional` **payloadBytes?**: `number`

Defined in: [packages/tx-builder/src/index.ts:55](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L55)

***

### storageMass?

> `readonly` `optional` **storageMass?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:61](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L61)

***

### version?

> `readonly` `optional` **version?**: `0` \| `1`

Defined in: [packages/tx-builder/src/index.ts:58](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L58)

***

### virtualDaaScore?

> `readonly` `optional` **virtualDaaScore?**: `bigint`

Defined in: [packages/tx-builder/src/index.ts:65](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/index.ts#L65)

Current virtual DAA score from the node. When provided, immature coinbase UTXOs are filtered out.
