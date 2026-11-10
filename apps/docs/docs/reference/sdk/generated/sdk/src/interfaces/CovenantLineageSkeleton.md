[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / CovenantLineageSkeleton

# Interface: CovenantLineageSkeleton

Defined in: [packages/sdk/src/covenant-lineage.ts:56](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L56)

## Properties

### covenantId

> `readonly` **covenantId**: `string`

Defined in: [packages/sdk/src/covenant-lineage.ts:57](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L57)

***

### findings

> `readonly` **findings**: readonly `string`[]

Defined in: [packages/sdk/src/covenant-lineage.ts:67](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L67)

***

### genesis?

> `readonly` `optional` **genesis?**: [`CovenantLineageTx`](CovenantLineageTx.md) & `object`

Defined in: [packages/sdk/src/covenant-lineage.ts:58](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L58)

#### Type Declaration

##### anchorCheck

> `readonly` **anchorCheck**: `"mismatch"` \| `"verified"` \| `"unverifiable"`

***

### rejected

> `readonly` **rejected**: readonly [`CovenantLineageTx`](CovenantLineageTx.md)[]

Defined in: [packages/sdk/src/covenant-lineage.ts:62](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L62)

Transitions the node rejected (final): kept as history, not part of the chain.

***

### tip

> `readonly` **tip**: readonly [`CovenantLineageOutput`](CovenantLineageOutput.md) & `object`[]

Defined in: [packages/sdk/src/covenant-lineage.ts:66](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L66)

The outputs no recorded (non-rejected) transaction of the chain spends: where the covenant should live.

***

### transitions

> `readonly` **transitions**: readonly [`CovenantLineageTx`](CovenantLineageTx.md)[]

Defined in: [packages/sdk/src/covenant-lineage.ts:60](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L60)

The transitions of the chain, in order (each spends outputs of an earlier one, or is a gap).

***

### unsent

> `readonly` **unsent**: readonly [`CovenantLineageTx`](CovenantLineageTx.md)[]

Defined in: [packages/sdk/src/covenant-lineage.ts:64](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L64)

Transactions signed here but never submitted: not part of the chain (their outputs do not exist).
