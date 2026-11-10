[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ToccataZkFeeEstimate

# Interface: ToccataZkFeeEstimate

Defined in: [packages/sdk/src/zk/toccata.ts:138](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L138)

## Properties

### baseComputeMass

> **baseComputeMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:144](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L144)

Non-contextual compute mass of the transaction WITHOUT the compute budget term (bytes + 10 * spk bytes).

***

### ~~baseTxMass~~

> **baseTxMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:146](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L146)

#### Deprecated

alias of baseComputeMass kept for one release

***

### cappedBelowMinimum

> **cappedBelowMinimum**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:152](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L152)

True when the recommended fee was clamped by maxFeeSompi below the minimum the mempool demands.

***

### computeBudgetMass

> **computeBudgetMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:147](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L147)

***

### computeMass

> **computeMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:142](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L142)

base compute mass + compute budget * 100 grams

***

### effectiveMass

> **effectiveMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:148](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L148)

***

### feerateSompiPerMass

> **feerateSompiPerMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:149](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L149)

***

### formula

> **formula**: `"baseComputeMass + computeBudget * 100 grams; fee = feerate * computeMass"`

Defined in: [packages/sdk/src/zk/toccata.ts:153](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L153)

***

### marginPercent

> **marginPercent**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:150](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L150)

***

### minimumRequiredSompi

> **minimumRequiredSompi**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:139](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L139)

***

### recommendedSompi

> **recommendedSompi**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:140](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L140)
