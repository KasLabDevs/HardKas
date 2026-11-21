[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / Kcc20DeployOptions

# Interface: Kcc20DeployOptions

Defined in: [packages/sdk/src/kcc20.ts:101](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L101)

## Properties

### extensionCommitment?

> `readonly` `optional` **extensionCommitment?**: `string`

Defined in: [packages/sdk/src/kcc20.ts:108](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L108)

The token's extension commitment (32 bytes, hex; default zero): every output of the token carries it.

***

### feeSompi?

> `readonly` `optional` **feeSompi?**: `bigint`

Defined in: [packages/sdk/src/kcc20.ts:109](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L109)

***

### funder

> `readonly` **funder**: `string`

Defined in: [packages/sdk/src/kcc20.ts:106](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L106)

The account (or P2PK address) whose coins pay the outputs' KAS and the fee.

***

### holders

> `readonly` **holders**: readonly [`Kcc20Holder`](Kcc20Holder.md)[]

Defined in: [packages/sdk/src/kcc20.ts:104](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L104)

The initial holders, in output order: one token output each, all of one covenant id.

***

### maxFeeSompi?

> `readonly` `optional` **maxFeeSompi?**: `bigint`

Defined in: [packages/sdk/src/kcc20.ts:110](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L110)

***

### program

> `readonly` **program**: [`Kcc20Program`](Kcc20Program.md)

Defined in: [packages/sdk/src/kcc20.ts:102](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L102)
