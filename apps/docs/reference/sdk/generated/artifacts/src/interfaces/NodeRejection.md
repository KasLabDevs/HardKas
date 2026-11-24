[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / NodeRejection

# Interface: NodeRejection

Defined in: [packages/artifacts/src/node-rejection.ts:31](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/node-rejection.ts#L31)

## Properties

### code

> `readonly` **code**: [`NodeRejectionCode`](../type-aliases/NodeRejectionCode.md)

Defined in: [packages/artifacts/src/node-rejection.ts:32](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/node-rejection.ts#L32)

***

### hint?

> `readonly` `optional` **hint?**: `string`

Defined in: [packages/artifacts/src/node-rejection.ts:45](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/node-rejection.ts#L45)

What to change, for the classes where the text alone says it (SCRIPT_LOCK_UNSATISFIED, STORAGE_MASS_ABOVE_LIMIT).

***

### limitUnits?

> `readonly` `optional` **limitUnits?**: `string`

Defined in: [packages/artifacts/src/node-rejection.ts:37](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/node-rejection.ts#L37)

***

### lockDeclared?

> `readonly` `optional` **lockDeclared?**: `string`

Defined in: [packages/artifacts/src/node-rejection.ts:40](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/node-rejection.ts#L40)

***

### lockRequired?

> `readonly` `optional` **lockRequired?**: `string`

Defined in: [packages/artifacts/src/node-rejection.ts:39](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/node-rejection.ts#L39)

SCRIPT_LOCK_UNSATISFIED ("… N \> M"): the value the script requires (N) and the transaction's own field (M), as reported.

***

### retriable

> `readonly` **retriable**: `false`

Defined in: [packages/artifacts/src/node-rejection.ts:34](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/node-rejection.ts#L34)

A rejection is final for the transaction: never retried, rebuilt or re-sent.

***

### storageMass?

> `readonly` `optional` **storageMass?**: `string`

Defined in: [packages/artifacts/src/node-rejection.ts:42](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/node-rejection.ts#L42)

STORAGE_MASS_ABOVE_LIMIT: the storage mass the node computed and its limit, as it reports them.

***

### storageMassLimit?

> `readonly` `optional` **storageMassLimit?**: `string`

Defined in: [packages/artifacts/src/node-rejection.ts:43](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/node-rejection.ts#L43)

***

### usedUnits?

> `readonly` `optional` **usedUnits?**: `string`

Defined in: [packages/artifacts/src/node-rejection.ts:36](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/node-rejection.ts#L36)

COMPUTE_BUDGET_INSUFFICIENT: the script units the node counted and the limit the input committed, as it reports them.
