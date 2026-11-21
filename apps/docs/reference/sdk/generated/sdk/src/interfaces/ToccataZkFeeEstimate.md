[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ToccataZkFeeEstimate

# Interface: ToccataZkFeeEstimate

Defined in: [packages/sdk/src/zk/toccata.ts:162](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L162)

## Properties

### baseComputeMass

> **baseComputeMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:168](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L168)

Non-contextual compute mass of the transaction WITHOUT the compute budget term (bytes + 10 * spk bytes).

***

### ~~baseTxMass~~

> **baseTxMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:170](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L170)

#### Deprecated

alias of baseComputeMass kept for one release

***

### cappedBelowMinimum

> **cappedBelowMinimum**: `boolean`

Defined in: [packages/sdk/src/zk/toccata.ts:176](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L176)

True when the recommended fee was clamped by maxFeeSompi below the minimum the mempool demands.

***

### computeBudgetMass

> **computeBudgetMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:171](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L171)

***

### computeMass

> **computeMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:166](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L166)

base compute mass + compute budget * 100 grams

***

### effectiveMass

> **effectiveMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:172](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L172)

***

### feerateSompiPerMass

> **feerateSompiPerMass**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:173](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L173)

***

### formula

> **formula**: `"baseComputeMass + computeBudget * 100 grams; fee = feerate * computeMass"`

Defined in: [packages/sdk/src/zk/toccata.ts:177](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L177)

***

### marginPercent

> **marginPercent**: `number`

Defined in: [packages/sdk/src/zk/toccata.ts:174](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L174)

***

### minimumRequiredSompi

> **minimumRequiredSompi**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:163](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L163)

***

### recommendedSompi

> **recommendedSompi**: `bigint`

Defined in: [packages/sdk/src/zk/toccata.ts:164](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/zk/toccata.ts#L164)
