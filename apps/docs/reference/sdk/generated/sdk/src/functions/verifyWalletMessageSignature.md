[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / verifyWalletMessageSignature

# Function: verifyWalletMessageSignature()

> **verifyWalletMessageSignature**(`input`): [`WalletMessageSignature`](../interfaces/WalletMessageSignature.md) & `object`

Defined in: [packages/sdk/src/wallets/message-signature.ts:88](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/message-signature.ts#L88)

Verifies a wallet's `signMessage` answer for `message` against the expected `address` with kaspa-wasm (`kaspa`, the
module that verifies). Returns the normalized signature and the key it verified against; refuses (typed) otherwise.

## Parameters

### input

#### address

`string`

#### kaspa

[`KaspaMessageVerifier`](../interfaces/KaspaMessageVerifier.md)

#### message

`string`

#### returned

`unknown`

## Returns

[`WalletMessageSignature`](../interfaces/WalletMessageSignature.md) & `object`
