[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / PrivateKeyAuthorizer

# Class: PrivateKeyAuthorizer

Defined in: packages/accounts/dist/index.d.ts:32

## Implements

- [`TxInputAuthorizer`](../interfaces/TxInputAuthorizer.md)

## Constructors

### Constructor

> **new PrivateKeyAuthorizer**(`accountName`, `privateKeyHex`): `PrivateKeyAuthorizer`

Defined in: packages/accounts/dist/index.d.ts:35

#### Parameters

##### accountName

`string`

##### privateKeyHex

`string`

#### Returns

`PrivateKeyAuthorizer`

## Properties

### accountName

> `readonly` **accountName**: `string`

Defined in: packages/accounts/dist/index.d.ts:33

***

### privateKeyHex

> `readonly` **privateKeyHex**: `string`

Defined in: packages/accounts/dist/index.d.ts:34

## Methods

### authorize()

> **authorize**(`context`): `InputAuthorization`

Defined in: packages/accounts/dist/index.d.ts:36

#### Parameters

##### context

[`TxInputAuthorizationContext`](../interfaces/TxInputAuthorizationContext.md)

#### Returns

`InputAuthorization`

#### Implementation of

[`TxInputAuthorizer`](../interfaces/TxInputAuthorizer.md).[`authorize`](../interfaces/TxInputAuthorizer.md#authorize)
