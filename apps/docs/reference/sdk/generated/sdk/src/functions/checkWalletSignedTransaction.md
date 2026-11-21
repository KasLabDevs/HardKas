[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / checkWalletSignedTransaction

# Function: checkWalletSignedTransaction()

> **checkWalletSignedTransaction**(`sentTxJson`, `returned`, `inputIndexes`): [`WalletSignatureCheck`](../interfaces/WalletSignatureCheck.md)

Defined in: [packages/sdk/src/wallets/signed-transaction-check.ts:147](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/signed-transaction-check.ts#L147)

Refuses (typed) a wallet's signed transaction that is not the one sent plus the signatures asked for (see the header);
returns, per asked input, the signature script and the 65-byte signature.

## Parameters

### sentTxJson

`string`

### returned

`unknown`

### inputIndexes

readonly `number`[]

## Returns

[`WalletSignatureCheck`](../interfaces/WalletSignatureCheck.md)
