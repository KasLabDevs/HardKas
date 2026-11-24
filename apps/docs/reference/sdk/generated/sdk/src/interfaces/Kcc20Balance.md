[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / Kcc20Balance

# Interface: Kcc20Balance

Defined in: [packages/sdk/src/kcc20.ts:130](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L130)

## Extends

- [`Kcc20Holdings`](Kcc20Holdings.md)

## Properties

### amount

> `readonly` **amount**: `bigint`

Defined in: [packages/sdk/src/kcc20.ts:134](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L134)

***

### covenantId

> `readonly` **covenantId**: `string`

Defined in: [packages/sdk/src/kcc20.ts:123](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L123)

#### Inherited from

[`Kcc20Holdings`](Kcc20Holdings.md).[`covenantId`](Kcc20Holdings.md#covenantid)

***

### findings

> `readonly` **findings**: readonly `string`[]

Defined in: [packages/sdk/src/kcc20.ts:126](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L126)

What the lineage and the node said that is worth knowing (an output not verified is not counted).

#### Inherited from

[`Kcc20Holdings`](Kcc20Holdings.md).[`findings`](Kcc20Holdings.md#findings)

***

### holder

> `readonly` **holder**: `string`

Defined in: [packages/sdk/src/kcc20.ts:131](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L131)

***

### holdings

> `readonly` **holdings**: readonly [`Kcc20Holding`](Kcc20Holding.md)[]

Defined in: [packages/sdk/src/kcc20.ts:124](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L124)

#### Inherited from

[`Kcc20Holdings`](Kcc20Holdings.md).[`holdings`](Kcc20Holdings.md#holdings)

***

### publicKey

> `readonly` **publicKey**: `string`

Defined in: [packages/sdk/src/kcc20.ts:133](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L133)

The holder's x-only public key; its outputs are those owned by it (0x00) or by its hash (0x01).

***

### scope

> `readonly` **scope**: `string`

Defined in: [packages/sdk/src/kcc20.ts:127](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L127)

#### Inherited from

[`Kcc20Holdings`](Kcc20Holdings.md).[`scope`](Kcc20Holdings.md#scope)
