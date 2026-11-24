[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / CovenantStateView

# Interface: CovenantStateView

Defined in: [packages/sdk/src/covenants.ts:231](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L231)

## Extends

- `CovenantState`

## Properties

### active

> **active**: `boolean`

Defined in: [packages/sdk/src/covenants.ts:146](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L146)

Whether the covenant has any unspent outputs

#### Inherited from

`CovenantState.active`

***

### covenantId

> **covenantId**: `string`

Defined in: [packages/sdk/src/covenants.ts:140](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L140)

#### Inherited from

`CovenantState.covenantId`

***

### findings

> `readonly` **findings**: readonly `string`[]

Defined in: [packages/sdk/src/covenants.ts:234](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L234)

***

### scope

> `readonly` **scope**: `string`

Defined in: [packages/sdk/src/covenants.ts:235](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L235)

***

### totalValueLocked

> **totalValueLocked**: `bigint`

Defined in: [packages/sdk/src/covenants.ts:142](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L142)

Total value locked in the covenant (sompi)

#### Inherited from

`CovenantState.totalValueLocked`

***

### utxoCount

> **utxoCount**: `number`

Defined in: [packages/sdk/src/covenants.ts:144](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L144)

Number of UTXOs belonging to this covenant

#### Inherited from

`CovenantState.utxoCount`

***

### utxos

> `readonly` **utxos**: readonly `object`[]

Defined in: [packages/sdk/src/covenants.ts:232](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L232)

***

### verified

> `readonly` **verified**: `boolean`

Defined in: [packages/sdk/src/covenants.ts:233](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L233)
