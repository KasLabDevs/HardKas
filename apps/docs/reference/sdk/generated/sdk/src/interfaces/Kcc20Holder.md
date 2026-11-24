[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / Kcc20Holder

# Interface: Kcc20Holder

Defined in: [packages/sdk/src/kcc20.ts:87](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L87)

A token output to create: its owner (p2pk-schnorr/v1), its token amount and the KAS it locks.

## Properties

### amount

> `readonly` **amount**: `bigint`

Defined in: [packages/sdk/src/kcc20.ts:91](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L91)

Token base units: an exact integer, 0 to 2^63 - 1.

***

### kasSompi?

> `readonly` `optional` **kasSompi?**: `bigint`

Defined in: [packages/sdk/src/kcc20.ts:93](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L93)

KAS locked in the output (sompi); default KCC20_DEFAULT_OUTPUT_SOMPI at deploy, an equal share at transfer.

***

### owner

> `readonly` **owner**: `string`

Defined in: [packages/sdk/src/kcc20.ts:89](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L89)

An account of this workspace, a P2PK (Schnorr) address or a 32-byte x-only public key (hex).
