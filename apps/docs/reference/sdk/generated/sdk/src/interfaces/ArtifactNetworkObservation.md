[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ArtifactNetworkObservation

# Interface: ArtifactNetworkObservation

Defined in: [packages/sdk/src/artifact-network-verify.ts:162](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L162)

## Properties

### acceptingBlockHash?

> `readonly` `optional` **acceptingBlockHash?**: `string`

Defined in: [packages/sdk/src/artifact-network-verify.ts:167](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L167)

***

### acceptingDaaScore?

> `readonly` `optional` **acceptingDaaScore?**: `string`

Defined in: [packages/sdk/src/artifact-network-verify.ts:170](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L170)

For a UTXO-set observation: the DAA score of the accepting chain block (the entry's `blockDaaScore`).

***

### confirmationsBlue?

> `readonly` `optional` **confirmationsBlue?**: `string`

Defined in: [packages/sdk/src/artifact-network-verify.ts:168](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L168)

***

### point

> `readonly` **point**: `object`

Defined in: [packages/sdk/src/artifact-network-verify.ts:171](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L171)

#### pruningPointHash?

> `readonly` `optional` **pruningPointHash?**: `string`

#### sinkBlueScore

> `readonly` **sinkBlueScore**: `string`

#### sinkHash

> `readonly` **sinkHash**: `string`

#### virtualDaaScore

> `readonly` **virtualDaaScore**: `string`

***

### scope

> `readonly` **scope**: `string`

Defined in: [packages/sdk/src/artifact-network-verify.ts:166](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L166)

What was read: a sentence for humans; the numbers below for programs.

***

### source

> `readonly` **source**: `"mempool"` \| `"virtual-chain"` \| `"utxo-set"`

Defined in: [packages/sdk/src/artifact-network-verify.ts:164](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L164)

Where the observation came from.
