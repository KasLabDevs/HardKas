[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / silverSpendWalletRequest

# Function: silverSpendWalletRequest()

> **silverSpendWalletRequest**(`draft`, `address`): [`WalletSignRequest`](../interfaces/WalletSignRequest.md)

Defined in: [packages/sdk/src/wallets/silver-spend-wallet.ts:55](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/silver-spend-wallet.ts#L55)

The request a browser wallet signs for a v0 SilverScript spend draft (`connectBrowserWallet(...).signTransaction`):
input 0 of the draft's unsigned transaction, SIGHASH_ALL, autoFinalized false. Mainnet refused first; no key read.

## Parameters

### draft

`SilverSpendDraft`

### address

`string`

## Returns

[`WalletSignRequest`](../interfaces/WalletSignRequest.md)
