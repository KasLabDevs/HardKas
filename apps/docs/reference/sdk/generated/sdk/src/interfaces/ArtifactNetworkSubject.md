[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ArtifactNetworkSubject

# Interface: ArtifactNetworkSubject

Defined in: [packages/sdk/src/artifact-network-verify.ts:102](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L102)

What `artifact verify` can check on a network for one artifact (pure, offline).

## Properties

### family?

> `readonly` `optional` **family?**: `NetworkFamily`

Defined in: [packages/sdk/src/artifact-network-verify.ts:105](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L105)

***

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/sdk/src/artifact-network-verify.ts:104](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L104)

***

### outputs

> `readonly` **outputs**: readonly [`ArtifactSubjectOutput`](ArtifactSubjectOutput.md)[]

Defined in: [packages/sdk/src/artifact-network-verify.ts:108](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L108)

***

### reason?

> `readonly` `optional` **reason?**: [`ArtifactNetworkReason`](../type-aliases/ArtifactNetworkReason.md)

Defined in: [packages/sdk/src/artifact-network-verify.ts:112](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L112)

Why the artifact names no transaction to look for, when it names none.

***

### schema

> `readonly` **schema**: `string`

Defined in: [packages/sdk/src/artifact-network-verify.ts:103](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L103)

***

### simulated

> `readonly` **simulated**: `boolean`

Defined in: [packages/sdk/src/artifact-network-verify.ts:107](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L107)

***

### since?

> `readonly` `optional` **since?**: `string`

Defined in: [packages/sdk/src/artifact-network-verify.ts:110](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L110)

A virtual-chain cursor the artifact itself carries (a submission's submit point).

***

### txId?

> `readonly` `optional` **txId?**: `string`

Defined in: [packages/sdk/src/artifact-network-verify.ts:106](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L106)
