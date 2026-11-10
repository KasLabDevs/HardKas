[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / CovenantInspection

# Interface: CovenantInspection

Defined in: [packages/sdk/src/covenants.ts:207](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L207)

## Extends

- `CovenantInfo`

## Properties

### active

> **active**: `boolean`

Defined in: [packages/sdk/src/covenants.ts:84](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L84)

Whether the covenant is active (has unspent outputs)

#### Inherited from

`CovenantInfo.active`

***

### checks

> `readonly` **checks**: `object`

Defined in: [packages/sdk/src/covenants.ts:214](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L214)

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

Defined in: [packages/sdk/src/covenants.ts:80](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L80)

#### Inherited from

`CovenantInfo.covenantId`

***

### findings

> `readonly` **findings**: readonly `string`[]

Defined in: [packages/sdk/src/covenants.ts:216](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L216)

***

### genesis?

> `readonly` `optional` **genesis?**: `object`

Defined in: [packages/sdk/src/covenants.ts:210](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L210)

#### anchorCheck

> `readonly` **anchorCheck**: `"mismatch"` \| `"verified"` \| `"unverifiable"`

#### outputs

> `readonly` **outputs**: readonly `string`[]

#### txId

> `readonly` **txId**: `string`

***

### rejected

> `readonly` **rejected**: `number`

Defined in: [packages/sdk/src/covenants.ts:212](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L212)

***

### scope

> `readonly` **scope**: `string`

Defined in: [packages/sdk/src/covenants.ts:217](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L217)

***

### tip

> `readonly` **tip**: readonly [`CovenantLineageOutput`](CovenantLineageOutput.md) & `object`[]

Defined in: [packages/sdk/src/covenants.ts:213](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L213)

***

### totalValueLocked

> `readonly` **totalValueLocked**: `bigint`

Defined in: [packages/sdk/src/covenants.ts:209](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L209)

***

### transitions

> `readonly` **transitions**: `number`

Defined in: [packages/sdk/src/covenants.ts:211](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L211)

***

### utxoCount

> `readonly` **utxoCount**: `number`

Defined in: [packages/sdk/src/covenants.ts:208](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L208)

Number of UTXOs carrying this covenant ID

#### Overrides

`CovenantInfo.utxoCount`

***

### verified

> `readonly` **verified**: `boolean`

Defined in: [packages/sdk/src/covenants.ts:215](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenants.ts#L215)
