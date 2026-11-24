[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / EscrowSignOptions

# Interface: EscrowSignOptions

Defined in: [packages/sdk/src/escrow.ts:677](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L677)

## Properties

### account

> `readonly` **account**: `string`

Defined in: [packages/sdk/src/escrow.ts:681](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L681)

The workspace account that signs: its key must be the one the escrow names for the role.

***

### keystorePassword?

> `readonly` `optional` **keystorePassword?**: `string`

Defined in: [packages/sdk/src/escrow.ts:683](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L683)

The password of that account's encrypted keystore, in memory only (development accounts need none).

***

### role

> `readonly` **role**: `string`

Defined in: [packages/sdk/src/escrow.ts:679](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/escrow.ts#L679)

The role this signature is for (buyer, seller or arbiter): the branch must require it.
