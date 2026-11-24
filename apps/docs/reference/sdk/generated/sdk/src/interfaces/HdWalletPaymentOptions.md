[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HdWalletPaymentOptions

# Interface: HdWalletPaymentOptions

Defined in: [packages/sdk/src/hd-wallet.ts:101](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L101)

## Properties

### account?

> `readonly` `optional` **account?**: `number`

Defined in: [packages/sdk/src/hd-wallet.ts:109](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L109)

***

### amount

> `readonly` **amount**: `string` \| `bigint`

Defined in: [packages/sdk/src/hd-wallet.ts:105](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L105)

KAS as a decimal string ("1.5"), or sompi as a bigint.

***

### feeRate?

> `readonly` `optional` **feeRate?**: `bigint`

Defined in: [packages/sdk/src/hd-wallet.ts:112](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L112)

Sompi per gram; default the node's "normal" estimate (as `tx.plan`).

***

### gapLimit?

> `readonly` `optional` **gapLimit?**: `number`

Defined in: [packages/sdk/src/hd-wallet.ts:110](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L110)

***

### maxFeeSompi?

> `readonly` `optional` **maxFeeSompi?**: `string` \| `number` \| `bigint`

Defined in: [packages/sdk/src/hd-wallet.ts:114](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L114)

The most this payment may pay in fees, sompi (as `tx.plan`); the workspace/default limit applies anyway.

***

### passphrase?

> `readonly` `optional` **passphrase?**: `string`

Defined in: [packages/sdk/src/hd-wallet.ts:108](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L108)

The BIP39 passphrase, when the wallet has one.

***

### password

> `readonly` **password**: `string`

Defined in: [packages/sdk/src/hd-wallet.ts:106](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L106)

***

### to

> `readonly` **to**: `string`

Defined in: [packages/sdk/src/hd-wallet.ts:103](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L103)

A Kaspa address or a workspace account name.
