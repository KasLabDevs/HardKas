[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / TxPlanRecipient

# Interface: TxPlanRecipient

Defined in: [packages/sdk/src/tx.ts:233](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L233)

R4-T · one recipient of a payment to several recipients in ONE transaction (`tx.plan({ outputs })`). `to` is an account
name, an address or an account, as `tx.plan`'s `to`; `amount` follows the units of `tx.plan`'s `amount` (a string is
KAS, a bigint is sompi, a number is KAS with a one-time warning), except that "all" (a consolidation) is not a recipient.

## Properties

### amount

> **amount**: `string` \| `number` \| `bigint`

Defined in: [packages/sdk/src/tx.ts:235](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L235)

***

### to

> **to**: `string` \| `HardkasAccount`

Defined in: [packages/sdk/src/tx.ts:234](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx.ts#L234)
