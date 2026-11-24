[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / KaspaMessageVerifier

# Interface: KaspaMessageVerifier

Defined in: [packages/sdk/src/wallets/message-signature.ts:32](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/message-signature.ts#L32)

The subset of kaspa-wasm the verification uses (the managed Node module or a page's web build).

## Properties

### Address

> **Address**: (`address`) => `any`

Defined in: [packages/sdk/src/wallets/message-signature.ts:35](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/message-signature.ts#L35)

#### Parameters

##### address

`string`

#### Returns

`any`

## Methods

### payToAddressScript()

> **payToAddressScript**(`address`): `any`

Defined in: [packages/sdk/src/wallets/message-signature.ts:34](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/message-signature.ts#L34)

#### Parameters

##### address

`any`

#### Returns

`any`

***

### verifyMessage()

> **verifyMessage**(`value`): `boolean`

Defined in: [packages/sdk/src/wallets/message-signature.ts:33](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/wallets/message-signature.ts#L33)

#### Parameters

##### value

###### message

`string`

###### publicKey

`string`

###### signature

`string`

#### Returns

`boolean`
