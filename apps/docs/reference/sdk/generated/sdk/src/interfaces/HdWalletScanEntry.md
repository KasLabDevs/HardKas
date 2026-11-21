[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HdWalletScanEntry

# Interface: HdWalletScanEntry

Defined in: [packages/sdk/src/hd-wallet.ts:61](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L61)

One used address of a scan: one the wallet's local index handed out (receive or change, below its stored next index),
or one past it that holds UTXOs now. An address that was used and then emptied is listed with zero balance.

## Properties

### account

> `readonly` **account**: `number`

Defined in: [packages/sdk/src/hd-wallet.ts:62](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L62)

***

### address

> `readonly` **address**: `string`

Defined in: [packages/sdk/src/hd-wallet.ts:66](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L66)

***

### balanceSompi

> `readonly` **balanceSompi**: `bigint`

Defined in: [packages/sdk/src/hd-wallet.ts:69](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L69)

***

### chain

> `readonly` **chain**: `HdChain`

Defined in: [packages/sdk/src/hd-wallet.ts:63](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L63)

***

### covenantUtxoCount

> `readonly` **covenantUtxoCount**: `number`

Defined in: [packages/sdk/src/hd-wallet.ts:71](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L71)

UTXOs of this address bound to a covenant: never spent by a payment (counted in the balance, not spendable).

***

### handedOut

> `readonly` **handedOut**: `boolean`

Defined in: [packages/sdk/src/hd-wallet.ts:73](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L73)

True when the wallet's local index handed this address out (its index is below the chain's stored next index).

***

### index

> `readonly` **index**: `number`

Defined in: [packages/sdk/src/hd-wallet.ts:64](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L64)

***

### path

> `readonly` **path**: `string`

Defined in: [packages/sdk/src/hd-wallet.ts:65](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L65)

***

### utxoCount

> `readonly` **utxoCount**: `number`

Defined in: [packages/sdk/src/hd-wallet.ts:68](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L68)

0 for a handed-out address that holds nothing now (used, then emptied, or never funded).
