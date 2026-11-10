[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / PrivateKeyAuthorizer

# Class: PrivateKeyAuthorizer

Defined in: [packages/accounts/dist/index.d.ts:32](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/accounts/dist/index.d.ts#L32)

## Implements

- [`TxInputAuthorizer`](../interfaces/TxInputAuthorizer.md)

## Constructors

### Constructor

> **new PrivateKeyAuthorizer**(`accountName`, `privateKeyHex`): `PrivateKeyAuthorizer`

Defined in: [packages/accounts/dist/index.d.ts:35](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/accounts/dist/index.d.ts#L35)

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

Defined in: [packages/accounts/dist/index.d.ts:33](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/accounts/dist/index.d.ts#L33)

***

### privateKeyHex

> `readonly` **privateKeyHex**: `string`

Defined in: [packages/accounts/dist/index.d.ts:34](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/accounts/dist/index.d.ts#L34)

## Methods

### authorize()

> **authorize**(`context`): `InputAuthorization`

Defined in: [packages/accounts/dist/index.d.ts:36](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/accounts/dist/index.d.ts#L36)

#### Parameters

##### context

[`TxInputAuthorizationContext`](../interfaces/TxInputAuthorizationContext.md)

#### Returns

`InputAuthorization`

#### Implementation of

[`TxInputAuthorizer`](../interfaces/TxInputAuthorizer.md).[`authorize`](../interfaces/TxInputAuthorizer.md#authorize)
