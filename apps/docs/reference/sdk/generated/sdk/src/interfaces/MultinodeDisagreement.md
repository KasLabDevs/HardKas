[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / MultinodeDisagreement

# Interface: MultinodeDisagreement

Defined in: [packages/sdk/src/multinode-read.ts:63](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L63)

## Properties

### code

> `readonly` **code**: `"UTXO_ENTRY_CONFLICT"` \| `"UTXO_PRESENCE_DISAGREES"` \| `"TX_ACCEPTANCE_DIFFERS"` \| `"TX_ACCEPTING_BLOCK_DIFFERS"`

Defined in: [packages/sdk/src/multinode-read.ts:64](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L64)

***

### detail

> `readonly` **detail**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:66](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L66)

***

### nodes

> `readonly` **nodes**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [packages/sdk/src/multinode-read.ts:67](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L67)

***

### subject

> `readonly` **subject**: `string`

Defined in: [packages/sdk/src/multinode-read.ts:65](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/multinode-read.ts#L65)
