[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / WalletSignedTransaction

# Interface: WalletSignedTransaction

Defined in: [packages/sdk/src/wallets/browser-signer.ts:75](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L75)

What a session hands back from a signature: the wallet's raw return and the structural check's result.

## Properties

### address

> `readonly` **address**: `string`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:77](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L77)

***

### check

> `readonly` **check**: [`WalletSignatureCheck`](WalletSignatureCheck.md)

Defined in: [packages/sdk/src/wallets/browser-signer.ts:80](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L80)

***

### kind

> `readonly` **kind**: [`BrowserWalletKind`](../type-aliases/BrowserWalletKind.md)

Defined in: [packages/sdk/src/wallets/browser-signer.ts:76](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L76)

***

### returned

> `readonly` **returned**: `unknown`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:79](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L79)

The wallet's return, as it came (hand it to HardKAS: completeWalletPayment / sdk.covenants.fillDraftFromWallet).
