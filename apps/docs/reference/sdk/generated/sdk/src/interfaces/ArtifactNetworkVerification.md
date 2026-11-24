[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ArtifactNetworkVerification

# Interface: ArtifactNetworkVerification

Defined in: [packages/sdk/src/artifact-network-verify.ts:211](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L211)

## Properties

### consensus

> `readonly` **consensus**: `object`

Defined in: [packages/sdk/src/artifact-network-verify.ts:226](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L226)

#### level

> `readonly` **level**: [`ArtifactConsensusLevel`](../type-aliases/ArtifactConsensusLevel.md)

#### message?

> `readonly` `optional` **message?**: `string`

#### policy

> `readonly` **policy**: `TxStatusPolicy`

#### reason?

> `readonly` `optional` **reason?**: [`ArtifactNetworkReason`](../type-aliases/ArtifactNetworkReason.md)

#### scope

> `readonly` **scope**: `string`

What CONSENSUS_CONFIRMED means here, and what it does not.

***

### network

> `readonly` **network**: `object`

Defined in: [packages/sdk/src/artifact-network-verify.ts:213](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L213)

#### addressLookup?

> `readonly` `optional` **addressLookup?**: [`ArtifactAddressLookup`](ArtifactAddressLookup.md)

R3-D: the `--address` lookup, when one was asked.

#### causes?

> `readonly` `optional` **causes?**: readonly `ArtifactUnobservableCause`[]

RC1-R2: for NOT_OBSERVABLE_HERE, why this node cannot show the transaction (a limitation, not inexistence).

#### level

> `readonly` **level**: [`ArtifactNetworkLevel`](../type-aliases/ArtifactNetworkLevel.md)

#### message?

> `readonly` `optional` **message?**: `string`

#### node?

> `readonly` `optional` **node?**: `NetworkIdentity`

#### observation?

> `readonly` `optional` **observation?**: [`ArtifactNetworkObservation`](ArtifactNetworkObservation.md)

#### reason?

> `readonly` `optional` **reason?**: [`ArtifactNetworkReason`](../type-aliases/ArtifactNetworkReason.md)

#### window?

> `readonly` `optional` **window?**: `ArtifactScanWindow`

RC1-R2: for NOT_OBSERVED, the virtual-chain window the look read.

***

### schema

> `readonly` **schema**: `"hardkas.artifactNetworkVerification.v1"`

Defined in: [packages/sdk/src/artifact-network-verify.ts:212](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L212)
