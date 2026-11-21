[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ArtifactSubjectOutput

# Interface: ArtifactSubjectOutput

Defined in: [packages/sdk/src/artifact-network-verify.ts:93](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L93)

An output of the artifact's transaction, as the artifact describes it (to look up in a node's UTXO set).

## Properties

### address

> `readonly` **address**: `string`

Defined in: [packages/sdk/src/artifact-network-verify.ts:94](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L94)

***

### amountSompi?

> `readonly` `optional` **amountSompi?**: `string`

Defined in: [packages/sdk/src/artifact-network-verify.ts:98](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L98)

***

### index?

> `readonly` `optional` **index?**: `number`

Defined in: [packages/sdk/src/artifact-network-verify.ts:97](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L97)

Known only when the artifact says it (a record's outpoint); otherwise any output of the transaction matches.

***

### transactionId

> `readonly` **transactionId**: `string`

Defined in: [packages/sdk/src/artifact-network-verify.ts:95](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/artifact-network-verify.ts#L95)
