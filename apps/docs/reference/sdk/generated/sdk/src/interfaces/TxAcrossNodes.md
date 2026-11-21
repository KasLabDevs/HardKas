[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / TxAcrossNodes

# Interface: TxAcrossNodes

Defined in: [packages/sdk/src/multinode-read.ts:362](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L362)

## Properties

### acceptedBy

> `readonly` **acceptedBy**: readonly `string`[]

Defined in: [packages/sdk/src/multinode-read.ts:370](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L370)

***

### disagreements

> `readonly` **disagreements**: readonly [`MultinodeDisagreement`](MultinodeDisagreement.md)[]

Defined in: [packages/sdk/src/multinode-read.ts:372](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L372)

***

### guarantee

> `readonly` **guarantee**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:364](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L364)

***

### lag

> `readonly` **lag**: readonly [`MultinodeLag`](MultinodeLag.md)[]

Defined in: [packages/sdk/src/multinode-read.ts:371](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L371)

***

### nodes

> `readonly` **nodes**: `Readonly`\<`Record`\<`string`, \{ `finding`: `TxObservation`\[`"finding"`\]; `observerId`: `string`; `point`: `TxObservation`\[`"point"`\]; \} \| \{ `error`: `string`; \}\>\>

Defined in: [packages/sdk/src/multinode-read.ts:367](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L367)

Per node: what its one look found, at which point; or why it could not look.

***

### observations

> `readonly` **observations**: readonly `object`[]

Defined in: [packages/sdk/src/multinode-read.ts:374](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L374)

The sealed observations (one per node, each with its own observer id), for a caller that keeps evidence.

***

### scope

> `readonly` **scope**: `"multi-observer"`

Defined in: [packages/sdk/src/multinode-read.ts:363](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L363)

***

### txId

> `readonly` **txId**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:365](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L365)
