[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / WalletSignedMessage

# Interface: WalletSignedMessage

Defined in: [packages/sdk/src/wallets/browser-signer.ts:84](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L84)

What a session hands back from `signMessage`: the wallet's raw answer and its normalized signature (not yet verified).

## Properties

### address

> `readonly` **address**: `string`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:86](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L86)

***

### kind

> `readonly` **kind**: [`BrowserWalletKind`](../type-aliases/BrowserWalletKind.md)

Defined in: [packages/sdk/src/wallets/browser-signer.ts:85](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L85)

***

### message

> `readonly` **message**: `string`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:87](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L87)

***

### returned

> `readonly` **returned**: `unknown`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:88](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L88)

***

### signature

> `readonly` **signature**: [`WalletMessageSignature`](WalletMessageSignature.md)

Defined in: [packages/sdk/src/wallets/browser-signer.ts:89](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L89)
