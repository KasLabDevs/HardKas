[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HdWalletDescriptor

# Interface: HdWalletDescriptor

Defined in: packages/accounts/dist/index.d.ts:1845

What a wallet is, public parts only.

## Properties

### accounts

> `readonly` **accounts**: readonly `object`[]

Defined in: packages/accounts/dist/index.d.ts:1851

***

### createdAt

> `readonly` **createdAt**: `string`

Defined in: packages/accounts/dist/index.d.ts:1859

***

### kind

> `readonly` **kind**: `HdWalletKind`

Defined in: packages/accounts/dist/index.d.ts:1850

***

### label

> `readonly` **label**: `string`

Defined in: packages/accounts/dist/index.d.ts:1847

***

### mnemonicWords?

> `readonly` `optional` **mnemonicWords?**: `12` \| `24`

Defined in: packages/accounts/dist/index.d.ts:1858

***

### network

> `readonly` **network**: `string`

Defined in: packages/accounts/dist/index.d.ts:1848

***

### networkType

> `readonly` **networkType**: `HdNetworkType`

Defined in: packages/accounts/dist/index.d.ts:1849

***

### origin

> `readonly` **origin**: `HdWalletOrigin`

Defined in: packages/accounts/dist/index.d.ts:1860

***

### passphraseRequired

> `readonly` **passphraseRequired**: `boolean`

Defined in: packages/accounts/dist/index.d.ts:1857

***

### path

> `readonly` **path**: `string`

Defined in: packages/accounts/dist/index.d.ts:1861

***

### verified

> `readonly` **verified**: `boolean`

Defined in: packages/accounts/dist/index.d.ts:1863

True only when this call opened the wallet with its password (header authenticated, keys recomputed).

***

### walletId

> `readonly` **walletId**: `string`

Defined in: packages/accounts/dist/index.d.ts:1846
