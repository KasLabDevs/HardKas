[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1MassMeasure

# Interface: V1MassMeasure

Defined in: [packages/tx-builder/src/v1-mass.ts:230](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-mass.ts#L230)

## Extends

- [`V1NonContextualMasses`](V1NonContextualMasses.md)

## Properties

### authority

> `readonly` **authority**: `string`

Defined in: [packages/tx-builder/src/v1-mass.ts:236](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-mass.ts#L236)

***

### computeMass

> `readonly` **computeMass**: `bigint`

Defined in: [packages/tx-builder/src/v1-mass.ts:116](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-mass.ts#L116)

#### Inherited from

[`V1NonContextualMasses`](V1NonContextualMasses.md).[`computeMass`](V1NonContextualMasses.md#computemass)

***

### feeMass

> `readonly` **feeMass**: `bigint`

Defined in: [packages/tx-builder/src/v1-mass.ts:232](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-mass.ts#L232)

***

### minimumFeeSompi

> `readonly` **minimumFeeSompi**: `bigint`

Defined in: [packages/tx-builder/src/v1-mass.ts:233](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-mass.ts#L233)

***

### size

> `readonly` **size**: `bigint`

Defined in: [packages/tx-builder/src/v1-mass.ts:115](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-mass.ts#L115)

#### Inherited from

[`V1NonContextualMasses`](V1NonContextualMasses.md).[`size`](V1NonContextualMasses.md#size)

***

### storageMass

> `readonly` **storageMass**: `bigint`

Defined in: [packages/tx-builder/src/v1-mass.ts:231](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-mass.ts#L231)

***

### transientMass

> `readonly` **transientMass**: `bigint`

Defined in: [packages/tx-builder/src/v1-mass.ts:117](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-mass.ts#L117)

#### Inherited from

[`V1NonContextualMasses`](V1NonContextualMasses.md).[`transientMass`](V1NonContextualMasses.md#transientmass)

***

### withinBlockLimits

> `readonly` **withinBlockLimits**: `boolean`

Defined in: [packages/tx-builder/src/v1-mass.ts:235](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-mass.ts#L235)

Each mass within its block limit (the node has no other "standard" mass limit).
