[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / WalletSignRequest

# Interface: WalletSignRequest

Defined in: [packages/sdk/src/wallets/browser-signer.ts:51](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L51)

What HardKAS asks a wallet to sign (made by `prepareWalletPayment` or `sdk.covenants.walletDraftRequest`).

## Properties

### address

> `readonly` **address**: `string`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:58](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L58)

The wallet address whose key signs.

***

### autoFinalized

> `readonly` **autoFinalized**: `boolean`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:67](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L67)

false for contract inputs: the wallet returns the bare signature push, HardKAS assembles the unlock.

***

### draftContentHash?

> `readonly` `optional` **draftContentHash?**: `string`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:71](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L71)

Contract requests: the draft whose slots the signatures fill (its contentHash).

***

### networkId

> `readonly` **networkId**: `string`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:56](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L56)

The HardKAS network id of the transaction ("simnet", "testnet-10", "devnet"; never mainnet).

***

### planArtifactId

> `readonly` **planArtifactId**: `string`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:69](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L69)

The plan the transaction is built from (its contentHash).

***

### publicKey

> `readonly` **publicKey**: `string`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:60](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L60)

That address's x-only public key (hex): the key each signature is verified against.

***

### purpose

> `readonly` **purpose**: `"payment"` \| `"contract"`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:54](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L54)

A P2PK payment (every input the wallet's), or contract inputs of a v1 engine draft (the wallet signs its slots).

***

### schema

> `readonly` **schema**: `"hardkas.walletSignRequest.v1"`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:52](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L52)

***

### signInputs

> `readonly` **signInputs**: readonly `object`[]

Defined in: [packages/sdk/src/wallets/browser-signer.ts:65](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L65)

Exactly the inputs the wallet signs, SIGHASH_ALL.

***

### txId

> `readonly` **txId**: `string`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:63](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L63)

***

### txJsonString

> `readonly` **txJsonString**: `string`

Defined in: [packages/sdk/src/wallets/browser-signer.ts:62](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/browser-signer.ts#L62)

The SDK's safe JSON of the unsigned transaction HardKAS built.
