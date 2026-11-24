[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / WalletSignatureCheck

# Interface: WalletSignatureCheck

Defined in: [packages/sdk/src/wallets/signed-transaction-check.ts:28](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/signed-transaction-check.ts#L28)

What a check of a wallet's signed transaction hands on: per asked input, its signature script and the 65-byte signature (signature ‖ SIGHASH_ALL).

## Properties

### signatures

> `readonly` **signatures**: `Readonly`\<`Record`\<`number`, `string`\>\>

Defined in: [packages/sdk/src/wallets/signed-transaction-check.ts:30](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/signed-transaction-check.ts#L30)

***

### signatureScripts

> `readonly` **signatureScripts**: `Readonly`\<`Record`\<`number`, `string`\>\>

Defined in: [packages/sdk/src/wallets/signed-transaction-check.ts:29](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/signed-transaction-check.ts#L29)

***

### txId?

> `readonly` `optional` **txId?**: `string`

Defined in: [packages/sdk/src/wallets/signed-transaction-check.ts:32](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/signed-transaction-check.ts#L32)

The transaction id the returned payload states, when it states one (it must be the one sent).
