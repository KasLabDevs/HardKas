[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / WalletPaymentOptions

# Interface: WalletPaymentOptions

Defined in: [packages/sdk/src/wallets/wallet-payments.ts:166](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/wallet-payments.ts#L166)

## Properties

### address

> `readonly` **address**: `string`

Defined in: [packages/sdk/src/wallets/wallet-payments.ts:168](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/wallet-payments.ts#L168)

The wallet's P2PK address (the session's): it pays, and gets the change.

***

### amount

> `readonly` **amount**: `string` \| `bigint`

Defined in: [packages/sdk/src/wallets/wallet-payments.ts:171](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/wallet-payments.ts#L171)

A string is KAS, a bigint is sompi (as `sdk.tx.plan`).

***

### feeRate?

> `readonly` `optional` **feeRate?**: `bigint`

Defined in: [packages/sdk/src/wallets/wallet-payments.ts:172](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/wallet-payments.ts#L172)

***

### maxFeeSompi?

> `readonly` `optional` **maxFeeSompi?**: `string` \| `number` \| `bigint`

Defined in: [packages/sdk/src/wallets/wallet-payments.ts:173](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/wallet-payments.ts#L173)

***

### to

> `readonly` **to**: `string`

Defined in: [packages/sdk/src/wallets/wallet-payments.ts:169](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/wallet-payments.ts#L169)
