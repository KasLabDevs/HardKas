[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1PlanInput

# Interface: V1PlanInput

Defined in: [packages/tx-builder/src/v1-plan.ts:62](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L62)

## Properties

### address

> `readonly` **address**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:65](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L65)

***

### amountSompi

> `readonly` **amountSompi**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:64](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L64)

***

### blockDaaScore?

> `readonly` `optional` **blockDaaScore?**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:68](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L68)

***

### computeBudget

> `readonly` **computeBudget**: `number`

Defined in: [packages/tx-builder/src/v1-plan.ts:74](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L74)

u16; script units allowed = budget × 10,000 + 9,999. Explicit: there is no estimator.

***

### contract?

> `readonly` `optional` **contract?**: [`V1ContractRef`](V1ContractRef.md)

Defined in: [packages/tx-builder/src/v1-plan.ts:76](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L76)

Required for p2sh and covenant inputs; absent for p2pk.

***

### covenantId?

> `readonly` `optional` **covenantId?**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:71](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L71)

Set for a covenant's UTXO (the node reports it).

***

### isCoinbase?

> `readonly` `optional` **isCoinbase?**: `boolean`

Defined in: [packages/tx-builder/src/v1-plan.ts:69](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L69)

***

### kind

> `readonly` **kind**: [`V1InputKind`](../type-aliases/V1InputKind.md)

Defined in: [packages/tx-builder/src/v1-plan.ts:72](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L72)

***

### outpoint

> `readonly` **outpoint**: `object`

Defined in: [packages/tx-builder/src/v1-plan.ts:63](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L63)

#### index

> `readonly` **index**: `number`

#### transactionId

> `readonly` **transactionId**: `string`

***

### scriptPublicKey

> `readonly` **scriptPublicKey**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:67](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L67)

"\<2-byte version\>\<script\>" hex, as the node lists it.

***

### sequence?

> `readonly` `optional` **sequence?**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:83](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L83)

V1-ENGINE-2 · the input's sequence (u64, decimal), for a contract with a relative time lock (`this.age…`); 0 when
absent. The node decides whether the lock is met (SEQUENCE_LOCK_REJECTED); the signature hash commits to it.

***

### signer?

> `readonly` `optional` **signer?**: `string`

Defined in: [packages/tx-builder/src/v1-plan.ts:78](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-plan.ts#L78)

The account whose key signs a p2pk input.
