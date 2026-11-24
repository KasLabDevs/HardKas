[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / Kcc20TransferOptions

# Interface: Kcc20TransferOptions

Defined in: [packages/sdk/src/kcc20.ts:137](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L137)

## Properties

### computeBudget?

> `readonly` `optional` **computeBudget?**: `number` \| `"estimate"`

Defined in: [packages/sdk/src/kcc20.ts:157](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L157)

Each token input's compute budget, or "estimate" (rusty-kaspa's heuristic upper bound; the default).

***

### config?

> `readonly` `optional` **config?**: `Kcc20Config`

Defined in: [packages/sdk/src/kcc20.ts:158](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L158)

***

### covenantId

> `readonly` **covenantId**: `string`

Defined in: [packages/sdk/src/kcc20.ts:138](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L138)

***

### feeSompi?

> `readonly` `optional` **feeSompi?**: `bigint`

Defined in: [packages/sdk/src/kcc20.ts:154](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L154)

***

### from?

> `readonly` `optional` **from?**: `string`

Defined in: [packages/sdk/src/kcc20.ts:143](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L143)

The holder whose outputs are spent and who signs them: an account of this workspace. Without `inputs` its outputs are
taken largest first, as few as cover the amounts; what they hold beyond the amounts goes back to it, as a token output.

***

### funder?

> `readonly` `optional` **funder?**: `string`

Defined in: [packages/sdk/src/kcc20.ts:153](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L153)

Who pays the fee (P2PK coins). Default (BETA-FIX W2): the sender's side, never a recipient's output — the sender's
token change output keeps what the fee leaves; without token change, the sender's (`from`'s) own coins pay it; when
neither can, KCC20_FEE_SOURCE_REQUIRED (kcc20TransferFeeSource). It used to be the first new output, the receiver's.

***

### inputs?

> `readonly` `optional` **inputs?**: readonly `object`[]

Defined in: [packages/sdk/src/kcc20.ts:145](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L145)

The token outputs to spend, in input order (the leader first, the others delegators), each with its signer (default `from`).

***

### maxFeeSompi?

> `readonly` `optional` **maxFeeSompi?**: `bigint`

Defined in: [packages/sdk/src/kcc20.ts:155](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L155)

***

### to

> `readonly` **to**: readonly [`Kcc20Holder`](Kcc20Holder.md)[]

Defined in: [packages/sdk/src/kcc20.ts:147](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L147)

The recipients, in output order (p2pk-schnorr/v1 owners).
