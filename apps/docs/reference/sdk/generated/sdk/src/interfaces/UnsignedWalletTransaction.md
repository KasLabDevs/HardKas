[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / UnsignedWalletTransaction

# Interface: UnsignedWalletTransaction

Defined in: [packages/sdk/src/wallets/wallet-payments.ts:64](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/wallet-payments.ts#L64)

The unsigned transaction of a payment plan, as the payment signer builds it, and what its signature hash reads.

## Properties

### sighash

> `readonly` **sighash**: `object`

Defined in: [packages/sdk/src/wallets/wallet-payments.ts:67](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/wallet-payments.ts#L67)

#### tx

> `readonly` **tx**: `KaspaSighashTransaction`

#### utxos

> `readonly` **utxos**: readonly `KaspaSighashUtxo`[]

***

### txId

> `readonly` **txId**: `string`

Defined in: [packages/sdk/src/wallets/wallet-payments.ts:66](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/wallet-payments.ts#L66)

***

### txJsonString

> `readonly` **txJsonString**: `string`

Defined in: [packages/sdk/src/wallets/wallet-payments.ts:65](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/wallet-payments.ts#L65)
