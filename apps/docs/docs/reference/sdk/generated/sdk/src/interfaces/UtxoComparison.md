[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / UtxoComparison

# Interface: UtxoComparison

Defined in: [packages/sdk/src/multinode-read.ts:254](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L254)

## Properties

### addresses

> `readonly` **addresses**: readonly `string`[]

Defined in: [packages/sdk/src/multinode-read.ts:257](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L257)

***

### agreed

> `readonly` **agreed**: readonly `string`[]

Defined in: [packages/sdk/src/multinode-read.ts:263](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L263)

Outpoints every comparable node listed with the same entry.

***

### disagreements

> `readonly` **disagreements**: readonly [`MultinodeDisagreement`](MultinodeDisagreement.md)[]

Defined in: [packages/sdk/src/multinode-read.ts:265](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L265)

***

### guarantee

> `readonly` **guarantee**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:256](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L256)

***

### lag

> `readonly` **lag**: readonly [`MultinodeLag`](MultinodeLag.md)[]

Defined in: [packages/sdk/src/multinode-read.ts:264](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L264)

***

### nodes

> `readonly` **nodes**: `Readonly`\<`Record`\<`string`, \{ `daaAfter`: `string`; `daaBefore`: `string`; `listed`: `number`; `totalSompi`: `string`; \} \| \{ `error`: `string`; \}\>\>

Defined in: [packages/sdk/src/multinode-read.ts:259](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L259)

Per node: what it listed, between which DAA scores (its answer is a snapshot taken between them).

***

### scope

> `readonly` **scope**: `"multi-observer"`

Defined in: [packages/sdk/src/multinode-read.ts:255](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L255)
