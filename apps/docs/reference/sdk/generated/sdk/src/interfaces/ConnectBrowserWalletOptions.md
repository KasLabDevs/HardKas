[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ConnectBrowserWalletOptions

# Interface: ConnectBrowserWalletOptions

Defined in: [packages/sdk/src/wallets/browser-signer.ts:118](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L118)

## Properties

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:120](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L120)

The HardKAS network id the session must be on (the plan's network). Mainnet is refused before the wallet is touched.

***

### onDropped?

> `readonly` `optional` **onDropped?**: (`reason`) => `void`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:124](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L124)

Called once when the session is dropped by the wallet (account or network changed).

#### Parameters

##### reason

`string`

#### Returns

`void`

***

### window?

> `readonly` `optional` **window?**: `unknown`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:122](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L122)

Where the extension is injected (default: globalThis, read when connect is called).
