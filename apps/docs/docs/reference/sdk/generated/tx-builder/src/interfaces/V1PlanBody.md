[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1PlanBody

# Interface: V1PlanBody

Defined in: [packages/tx-builder/src/v1-plan.ts:142](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L142)

The v1 part of a TxPlan artifact (plus the base fields every plan has).

## Properties

### computeBudget?

> `readonly` `optional` **computeBudget?**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:157](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L157)

A v0 field; a v1 plan commits a budget per input instead (both at once is invalid).

***

### covenantOutpoints?

> `readonly` `optional` **covenantOutpoints?**: readonly `string`[]

Defined in: [packages/tx-builder/src/v1-plan.ts:154](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L154)

"txid:index" of every covenant input, so F1.6 finds pending sends by covenant.

***

### estimatedFeeSompi

> `readonly` **estimatedFeeSompi**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:148](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L148)

***

### estimatedMass

> `readonly` **estimatedMass**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:149](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L149)

***

### genesisCovenantGroups?

> `readonly` `optional` **genesisCovenantGroups?**: readonly [`V1GenesisGroup`](V1GenesisGroup.md)[]

Defined in: [packages/tx-builder/src/v1-plan.ts:146](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L146)

***

### inputs

> `readonly` **inputs**: readonly [`V1PlanInput`](V1PlanInput.md)[]

Defined in: [packages/tx-builder/src/v1-plan.ts:144](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L144)

***

### maxFeeSompi?

> `readonly` `optional` **maxFeeSompi?**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:152](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L152)

Mandatory in v1 (V1_FEE_LIMIT_REQUIRED).

***

### nextState?

> `readonly` `optional` **nextState?**: readonly [`V1NextState`](../type-aliases/V1NextState.md)[]

Defined in: [packages/tx-builder/src/v1-plan.ts:155](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L155)

***

### outputs

> `readonly` **outputs**: readonly [`V1PlanOutput`](V1PlanOutput.md)[]

Defined in: [packages/tx-builder/src/v1-plan.ts:145](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L145)

***

### payload?

> `readonly` `optional` **payload?**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:147](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L147)

***

### storageMass

> `readonly` **storageMass**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:150](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L150)

***

### txVersion

> `readonly` **txVersion**: `1`

Defined in: [packages/tx-builder/src/v1-plan.ts:143](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L143)
