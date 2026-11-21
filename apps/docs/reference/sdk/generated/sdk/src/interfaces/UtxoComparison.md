[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / UtxoComparison

# Interface: UtxoComparison

Defined in: [packages/sdk/src/multinode-read.ts:257](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L257)

## Properties

### addresses

> `readonly` **addresses**: readonly `string`[]

Defined in: [packages/sdk/src/multinode-read.ts:260](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L260)

***

### agreed

> `readonly` **agreed**: readonly `string`[]

Defined in: [packages/sdk/src/multinode-read.ts:266](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L266)

Outpoints every comparable node listed with the same entry.

***

### disagreements

> `readonly` **disagreements**: readonly [`MultinodeDisagreement`](MultinodeDisagreement.md)[]

Defined in: [packages/sdk/src/multinode-read.ts:268](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L268)

***

### guarantee

> `readonly` **guarantee**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:259](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L259)

***

### lag

> `readonly` **lag**: readonly [`MultinodeLag`](MultinodeLag.md)[]

Defined in: [packages/sdk/src/multinode-read.ts:267](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L267)

***

### nodes

> `readonly` **nodes**: `Readonly`\<`Record`\<`string`, \{ `daaAfter`: `string`; `daaBefore`: `string`; `listed`: `number`; `totalSompi`: `string`; \} \| \{ `error`: `string`; \}\>\>

Defined in: [packages/sdk/src/multinode-read.ts:262](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L262)

Per node: what it listed, between which DAA scores (its answer is a snapshot taken between them).

***

### scope

> `readonly` **scope**: `"multi-observer"`

Defined in: [packages/sdk/src/multinode-read.ts:258](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L258)
