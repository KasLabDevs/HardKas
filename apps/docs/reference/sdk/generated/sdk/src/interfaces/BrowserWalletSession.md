[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / BrowserWalletSession

# Interface: BrowserWalletSession

Defined in: [packages/sdk/src/wallets/browser-signer.ts:92](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L92)

## Properties

### active

> `readonly` **active**: `boolean`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:102](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L102)

false once the session was dropped (account or network changed, closed).

***

### address

> `readonly` **address**: `string`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:94](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L94)

***

### droppedReason?

> `readonly` `optional` **droppedReason?**: `string`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:103](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L103)

***

### kind

> `readonly` **kind**: [`BrowserWalletKind`](../type-aliases/BrowserWalletKind.md)

Defined in: [packages/sdk/src/wallets/browser-signer.ts:93](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L93)

***

### networkEvidence

> `readonly` **networkEvidence**: `"wallet"` \| `"connect"` \| `"address-prefix"`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:98](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L98)

How the wallet's network was established: its own answer, the id it was connected with, or its address prefix only.

***

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:96](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L96)

The HardKAS network id the session is for.

***

### statedPublicKey?

> `readonly` `optional` **statedPublicKey?**: `string`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:100](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L100)

The public key the wallet states, if it states one (informational: HardKAS verifies against the address's key).

## Methods

### close()

> **close**(): `void`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:115](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L115)

Drops the session and its event listeners.

#### Returns

`void`

***

### refresh()

> **refresh**(): `Promise`\<`void`\>

Defined in: [packages/sdk/src/wallets/browser-signer.ts:105](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L105)

Reads the wallet's active address and network again; refuses (and drops the session) when they are not the session's.

#### Returns

`Promise`\<`void`\>

***

### signMessage()

> **signMessage**(`message`): `Promise`\<[`WalletSignedMessage`](WalletSignedMessage.md)\>

Defined in: [packages/sdk/src/wallets/browser-signer.ts:113](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L113)

Asks the wallet to sign a text message (`signMessage(message)`, one argument) and normalizes its answer (one of the
three shapes of message-signature.ts). The signature is NOT verified here: verify it with
`verifyWalletMessageSignature` (a page's own kaspa-wasm) or, on the Node side, `verifyWalletMessage`.

#### Parameters

##### message

`string`

#### Returns

`Promise`\<[`WalletSignedMessage`](WalletSignedMessage.md)\>

***

### signTransaction()

> **signTransaction**(`request`): `Promise`\<[`WalletSignedTransaction`](WalletSignedTransaction.md)\>

Defined in: [packages/sdk/src/wallets/browser-signer.ts:107](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L107)

Asks the wallet to sign exactly the request's inputs, then checks what came back (see the header).

#### Parameters

##### request

[`WalletSignRequest`](WalletSignRequest.md)

#### Returns

`Promise`\<[`WalletSignedTransaction`](WalletSignedTransaction.md)\>
