[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / verifyWalletMessage

# Function: verifyWalletMessage()

> **verifyWalletMessage**(`input`): [`WalletMessageSignature`](../interfaces/WalletMessageSignature.md) & `object`

Defined in: [packages/sdk/src/wallets/wallet-payments.ts:158](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/wallet-payments.ts#L158)

A browser wallet's `signMessage` answer (any of the three shapes) verified with the managed kaspa-wasm's
`verifyMessage` against `address` (see wallets/message-signature.ts); refusals are HardkasError with the same codes.

## Parameters

### input

#### address

`string`

#### message

`string`

#### returned

`unknown`

## Returns

[`WalletMessageSignature`](../interfaces/WalletMessageSignature.md) & `object`
