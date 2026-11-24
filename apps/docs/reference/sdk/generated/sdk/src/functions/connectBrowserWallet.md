[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / connectBrowserWallet

# Function: connectBrowserWallet()

> **connectBrowserWallet**(`kind`, `options`): `Promise`\<[`BrowserWalletSession`](../interfaces/BrowserWalletSession.md)\>

Defined in: [packages/sdk/src/wallets/browser-signer.ts:297](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L297)

Connects to a browser wallet for transactions on `options.networkId`: mainnet refused before the wallet is touched; the
extension looked up now; the connection asked (a popup); the active address and network read and checked; the
session dropped on `accountsChanged` / `networkChanged`.

## Parameters

### kind

[`BrowserWalletKind`](../type-aliases/BrowserWalletKind.md)

### options

[`ConnectBrowserWalletOptions`](../interfaces/ConnectBrowserWalletOptions.md)

## Returns

`Promise`\<[`BrowserWalletSession`](../interfaces/BrowserWalletSession.md)\>
