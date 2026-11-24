[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / WalletMessageSignature

# Interface: WalletMessageSignature

Defined in: [packages/sdk/src/wallets/message-signature.ts:23](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/message-signature.ts#L23)

## Properties

### shape

> `readonly` **shape**: [`WalletMessageSignatureShape`](../type-aliases/WalletMessageSignatureShape.md)

Defined in: [packages/sdk/src/wallets/message-signature.ts:26](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/message-signature.ts#L26)

***

### signatureHex

> `readonly` **signatureHex**: `string`

Defined in: [packages/sdk/src/wallets/message-signature.ts:25](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/message-signature.ts#L25)

The 64-byte Schnorr signature, lower-case hex.

***

### statedAddress?

> `readonly` `optional` **statedAddress?**: `string`

Defined in: [packages/sdk/src/wallets/message-signature.ts:28](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/message-signature.ts#L28)

The address the wallet stated with the signature (Kaspire), if any.
