[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / silverSpendSignatureFromWallet

# Function: silverSpendSignatureFromWallet()

> **silverSpendSignatureFromWallet**(`draft`, `request`, `returned`): `string`

Defined in: [packages/sdk/src/wallets/silver-spend-wallet.ts:65](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/silver-spend-wallet.ts#L65)

The 65-byte `sig` value (hex) a browser wallet returned for a v0 SilverScript spend draft, checked in full: the request
must be the one the draft gives now (WALLET_REQUEST_MISMATCH), the returned transaction the one sent with input 0
signed `41 <sig> 01` (WALLET_SIGNED_TRANSACTION_CHANGED, WALLET_SIGNATURE_MISSING), the signature valid by the
address's key over HardKAS's signature hash (WALLET_SIGNATURE_INVALID). Give it to `finalizeSilverSpend`.

## Parameters

### draft

`SilverSpendDraft`

### request

[`WalletSignRequest`](../interfaces/WalletSignRequest.md)

### returned

`unknown`

## Returns

`string`
