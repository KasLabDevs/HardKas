[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / TxAcrossNodes

# Interface: TxAcrossNodes

Defined in: [packages/sdk/src/multinode-read.ts:359](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L359)

## Properties

### acceptedBy

> `readonly` **acceptedBy**: readonly `string`[]

Defined in: [packages/sdk/src/multinode-read.ts:367](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L367)

***

### disagreements

> `readonly` **disagreements**: readonly [`MultinodeDisagreement`](MultinodeDisagreement.md)[]

Defined in: [packages/sdk/src/multinode-read.ts:369](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L369)

***

### guarantee

> `readonly` **guarantee**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:361](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L361)

***

### lag

> `readonly` **lag**: readonly [`MultinodeLag`](MultinodeLag.md)[]

Defined in: [packages/sdk/src/multinode-read.ts:368](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L368)

***

### nodes

> `readonly` **nodes**: `Readonly`\<`Record`\<`string`, \{ `finding`: `TxObservation`\[`"finding"`\]; `observerId`: `string`; `point`: `TxObservation`\[`"point"`\]; \} \| \{ `error`: `string`; \}\>\>

Defined in: [packages/sdk/src/multinode-read.ts:364](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L364)

Per node: what its one look found, at which point; or why it could not look.

***

### observations

> `readonly` **observations**: readonly `object`[]

Defined in: [packages/sdk/src/multinode-read.ts:371](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L371)

The sealed observations (one per node, each with its own observer id), for a caller that keeps evidence.

***

### scope

> `readonly` **scope**: `"multi-observer"`

Defined in: [packages/sdk/src/multinode-read.ts:360](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L360)

***

### txId

> `readonly` **txId**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:362](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/multinode-read.ts#L362)
