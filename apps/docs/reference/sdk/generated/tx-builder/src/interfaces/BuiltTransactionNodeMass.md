[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / BuiltTransactionNodeMass

# Interface: BuiltTransactionNodeMass

Defined in: [packages/tx-builder/src/mass.ts:243](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L243)

The node's figures for a built transaction, and whether the node relays it at those masses.

## Properties

### authority

> `readonly` **authority**: `string`

Defined in: [packages/tx-builder/src/mass.ts:262](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L262)

***

### computeMass

> `readonly` **computeMass**: `bigint`

Defined in: [packages/tx-builder/src/mass.ts:245](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L245)

***

### exceeded?

> `readonly` `optional` **exceeded?**: `object`

Defined in: [packages/tx-builder/src/mass.ts:260](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L260)

The first mass above its limit, when not relayable, and the same in words.

#### limit

> `readonly` **limit**: `bigint`

#### mass

> `readonly` **mass**: `"compute"` \| `"storage"` \| `"transient"`

#### value

> `readonly` **value**: `bigint`

***

### exceededText?

> `readonly` `optional` **exceededText?**: `string`

Defined in: [packages/tx-builder/src/mass.ts:261](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L261)

***

### feeMass

> `readonly` **feeMass**: `bigint`

Defined in: [packages/tx-builder/src/mass.ts:249](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L249)

max(compute, transient normalized to the compute limit): the mass the relay fee is charged on.

***

### limits

> `readonly` **limits**: `object`

Defined in: [packages/tx-builder/src/mass.ts:256](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L256)

The limits checked: compute mass within the standard 100,000 g for v0 (the v1 engine's block limit for v1), storage
and transient mass within the block limits (500,000 g and 1,000,000 g).

#### compute

> `readonly` **compute**: `bigint`

#### storage

> `readonly` **storage**: `bigint`

#### transient

> `readonly` **transient**: `bigint`

***

### minimumFeeSompi

> `readonly` **minimumFeeSompi**: `bigint`

Defined in: [packages/tx-builder/src/mass.ts:251](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L251)

The node's minimum relay fee: 100 sompi per gram of `feeMass`. The storage mass has no fee floor of its own.

***

### relayable

> `readonly` **relayable**: `boolean`

Defined in: [packages/tx-builder/src/mass.ts:258](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L258)

False when a mass is above its limit: the node never relays the transaction.

***

### storageMass

> `readonly` **storageMass**: `bigint`

Defined in: [packages/tx-builder/src/mass.ts:247](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L247)

***

### transientMass

> `readonly` **transientMass**: `bigint`

Defined in: [packages/tx-builder/src/mass.ts:246](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L246)

***

### version

> `readonly` **version**: `number`

Defined in: [packages/tx-builder/src/mass.ts:244](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/mass.ts#L244)
