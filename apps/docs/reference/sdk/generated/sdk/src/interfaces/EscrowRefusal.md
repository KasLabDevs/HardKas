[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / EscrowRefusal

# Interface: EscrowRefusal

Defined in: [packages/sdk/src/escrow.ts:139](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L139)

A refusal of a lifecycle step, with the HTTP answer the dev server's routes always gave for it: `status`, the body's
`error` text and, only where the route's body carried one, its `code` field (`bodyCode`). `code` is always set for SDK
callers (a HardkasError code).

## Properties

### bodyCode?

> `readonly` `optional` **bodyCode?**: `true`

Defined in: [packages/sdk/src/escrow.ts:144](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L144)

***

### code

> `readonly` **code**: `string`

Defined in: [packages/sdk/src/escrow.ts:142](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L142)

***

### error

> `readonly` **error**: `string`

Defined in: [packages/sdk/src/escrow.ts:143](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L143)

***

### ok

> `readonly` **ok**: `false`

Defined in: [packages/sdk/src/escrow.ts:140](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L140)

***

### status

> `readonly` **status**: `number`

Defined in: [packages/sdk/src/escrow.ts:141](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L141)
