[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / CovenantLineage

# Interface: CovenantLineage

Defined in: [packages/sdk/src/covenants.ts:187](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L187)

## Extends

- `Omit`\<[`CovenantLineageSkeleton`](CovenantLineageSkeleton.md), `"tip"`\>

## Properties

### checks

> `readonly` **checks**: `object`

Defined in: [packages/sdk/src/covenants.ts:196](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L196)

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

> `readonly` **covenantId**: `string`

Defined in: [packages/sdk/src/covenant-lineage.ts:57](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenant-lineage.ts#L57)

#### Inherited from

[`CovenantLineageSkeleton`](CovenantLineageSkeleton.md).[`covenantId`](CovenantLineageSkeleton.md#covenantid)

***

### findings

> `readonly` **findings**: readonly `string`[]

Defined in: [packages/sdk/src/covenant-lineage.ts:67](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenant-lineage.ts#L67)

#### Inherited from

[`CovenantLineageSkeleton`](CovenantLineageSkeleton.md).[`findings`](CovenantLineageSkeleton.md#findings)

***

### genesis?

> `readonly` `optional` **genesis?**: [`CovenantLineageTx`](CovenantLineageTx.md) & `object`

Defined in: [packages/sdk/src/covenant-lineage.ts:58](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenant-lineage.ts#L58)

#### Type Declaration

##### anchorCheck

> `readonly` **anchorCheck**: `"mismatch"` \| `"verified"` \| `"unverifiable"`

#### Inherited from

[`CovenantLineageSkeleton`](CovenantLineageSkeleton.md).[`genesis`](CovenantLineageSkeleton.md#genesis)

***

### rejected

> `readonly` **rejected**: readonly [`CovenantLineageTx`](CovenantLineageTx.md)[]

Defined in: [packages/sdk/src/covenant-lineage.ts:62](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenant-lineage.ts#L62)

Transitions the node rejected (final): kept as history, not part of the chain.

#### Inherited from

[`CovenantLineageSkeleton`](CovenantLineageSkeleton.md).[`rejected`](CovenantLineageSkeleton.md#rejected)

***

### scope

> `readonly` **scope**: `string`

Defined in: [packages/sdk/src/covenants.ts:205](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L205)

***

### tip

> `readonly` **tip**: readonly [`CovenantLineageOutput`](CovenantLineageOutput.md) & `object`[]

Defined in: [packages/sdk/src/covenants.ts:188](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L188)

***

### transitions

> `readonly` **transitions**: readonly [`CovenantLineageTx`](CovenantLineageTx.md)[]

Defined in: [packages/sdk/src/covenant-lineage.ts:60](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenant-lineage.ts#L60)

The transitions of the chain, in order (each spends outputs of an earlier one, or is a gap).

#### Inherited from

[`CovenantLineageSkeleton`](CovenantLineageSkeleton.md).[`transitions`](CovenantLineageSkeleton.md#transitions)

***

### unsent

> `readonly` **unsent**: readonly [`CovenantLineageTx`](CovenantLineageTx.md)[]

Defined in: [packages/sdk/src/covenant-lineage.ts:64](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenant-lineage.ts#L64)

Transactions signed here but never submitted: not part of the chain (their outputs do not exist).

#### Inherited from

[`CovenantLineageSkeleton`](CovenantLineageSkeleton.md).[`unsent`](CovenantLineageSkeleton.md#unsent)

***

### verified

> `readonly` **verified**: `boolean`

Defined in: [packages/sdk/src/covenants.ts:204](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L204)

The anchor verified, the links complete, no conflict, the node asked, and every tip output listed unspent (no state mismatch).
