[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ArtifactAddressLookup

# Interface: ArtifactAddressLookup

Defined in: [packages/sdk/src/artifact-network-verify.ts:180](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L180)

R3-D · the `--address` lookup: the history of an address the transaction pays or spends from, read over a bounded
window of the node's selected chain (@hardkas/query locateTransactionByAddress). When it finds the transaction, its
accepting chain block's predecessor is the look's cursor, and the acceptance is the look's own chain answer (sealed
like any other); when it does not, it says which window it read — never an absence beyond it.

## Properties

### acceptingBlockHash?

> `readonly` `optional` **acceptingBlockHash?**: `string`

Defined in: [packages/sdk/src/artifact-network-verify.ts:184](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L184)

The chain block the history saw accept it (found only).

***

### address

> `readonly` **address**: `string`

Defined in: [packages/sdk/src/artifact-network-verify.ts:181](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L181)

***

### cursor?

> `readonly` `optional` **cursor?**: `string`

Defined in: [packages/sdk/src/artifact-network-verify.ts:186](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L186)

The look's cursor it gave (found only): the chain block before the acceptance.

***

### error?

> `readonly` `optional` **error?**: `string`

Defined in: [packages/sdk/src/artifact-network-verify.ts:199](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L199)

The lookup could not be made (its typed code and message); the look went on without it.

***

### found

> `readonly` **found**: `boolean`

Defined in: [packages/sdk/src/artifact-network-verify.ts:182](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L182)

***

### window?

> `readonly` `optional` **window?**: `object`

Defined in: [packages/sdk/src/artifact-network-verify.ts:188](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L188)

The window the history read.

#### chainBlocks

> `readonly` **chainBlocks**: `number`

#### firstCoveredDaaScore

> `readonly` **firstCoveredDaaScore**: `string`

#### from

> `readonly` **from**: `string`

#### pruningPointIsGenesis

> `readonly` **pruningPointIsGenesis**: `boolean`

#### reachedTip

> `readonly` **reachedTip**: `boolean`

#### startsAtPruningPoint

> `readonly` **startsAtPruningPoint**: `boolean`

#### to?

> `readonly` `optional` **to?**: `string`

#### toDaaScore?

> `readonly` `optional` **toDaaScore?**: `string`
