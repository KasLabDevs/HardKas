[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / NodeSetReading

# Interface: NodeSetReading

Defined in: [packages/sdk/src/multinode-read.ts:53](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L53)

## Properties

### expectedNetwork

> `readonly` **expectedNetwork**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:56](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L56)

***

### guarantee

> `readonly` **guarantee**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:55](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L55)

***

### lagThresholdDaa

> `readonly` **lagThresholdDaa**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:57](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L57)

***

### nodes

> `readonly` **nodes**: readonly [`NodeReading`](NodeReading.md)[]

Defined in: [packages/sdk/src/multinode-read.ts:58](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L58)

***

### reference?

> `readonly` `optional` **reference?**: `object`

Defined in: [packages/sdk/src/multinode-read.ts:60](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L60)

The usable node with the highest virtual DAA score (the reference for lag).

#### label

> `readonly` **label**: `string`

#### virtualDaaScore

> `readonly` **virtualDaaScore**: `string`

***

### scope

> `readonly` **scope**: `"multi-observer"`

Defined in: [packages/sdk/src/multinode-read.ts:54](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L54)
