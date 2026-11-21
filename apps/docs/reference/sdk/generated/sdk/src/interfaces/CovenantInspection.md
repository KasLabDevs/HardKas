[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / CovenantInspection

# Interface: CovenantInspection

Defined in: [packages/sdk/src/covenants.ts:218](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L218)

## Extends

- `CovenantInfo`

## Properties

### active

> **active**: `boolean`

Defined in: [packages/sdk/src/covenants.ts:95](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L95)

Whether the covenant is active (has unspent outputs)

#### Inherited from

`CovenantInfo.active`

***

### checks

> `readonly` **checks**: `object`

Defined in: [packages/sdk/src/covenants.ts:225](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L225)

#### anchor

> `readonly` **anchor**: `"mismatch"` \| `"verified"` \| `"unverifiable"` \| `"no-genesis"`

#### conflicts

> `readonly` **conflicts**: `number`

#### links

> `readonly` **links**: `"complete"` \| `"gaps"`

#### node

> `readonly` **node**: `"not-checked"` \| `"checked"`

#### tip

> `readonly` **tip**: `"none"` \| `"partial"` \| `"unspent"`

***

### covenantId

> **covenantId**: `string`

Defined in: [packages/sdk/src/covenants.ts:91](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L91)

#### Inherited from

`CovenantInfo.covenantId`

***

### findings

> `readonly` **findings**: readonly `string`[]

Defined in: [packages/sdk/src/covenants.ts:227](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L227)

***

### genesis?

> `readonly` `optional` **genesis?**: `object`

Defined in: [packages/sdk/src/covenants.ts:221](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L221)

#### anchorCheck

> `readonly` **anchorCheck**: `"mismatch"` \| `"verified"` \| `"unverifiable"`

#### outputs

> `readonly` **outputs**: readonly `string`[]

#### txId

> `readonly` **txId**: `string`

***

### rejected

> `readonly` **rejected**: `number`

Defined in: [packages/sdk/src/covenants.ts:223](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L223)

***

### scope

> `readonly` **scope**: `string`

Defined in: [packages/sdk/src/covenants.ts:228](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L228)

***

### tip

> `readonly` **tip**: readonly [`CovenantLineageOutput`](CovenantLineageOutput.md) & `object`[]

Defined in: [packages/sdk/src/covenants.ts:224](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L224)

***

### totalValueLocked

> `readonly` **totalValueLocked**: `bigint`

Defined in: [packages/sdk/src/covenants.ts:220](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L220)

***

### transitions

> `readonly` **transitions**: `number`

Defined in: [packages/sdk/src/covenants.ts:222](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L222)

***

### utxoCount

> `readonly` **utxoCount**: `number`

Defined in: [packages/sdk/src/covenants.ts:219](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L219)

Number of UTXOs carrying this covenant ID

#### Overrides

`CovenantInfo.utxoCount`

***

### verified

> `readonly` **verified**: `boolean`

Defined in: [packages/sdk/src/covenants.ts:226](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L226)
