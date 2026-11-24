[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HdWalletManager

# Class: HdWalletManager

Defined in: packages/accounts/dist/index.d.ts:1906

## Constructors

### Constructor

> **new HdWalletManager**(`options`): `HdWalletManager`

Defined in: packages/accounts/dist/index.d.ts:1909

#### Parameters

##### options

`HdWalletManagerOptions`

#### Returns

`HdWalletManager`

## Properties

### workspaceRoot

> `readonly` **workspaceRoot**: `string`

Defined in: packages/accounts/dist/index.d.ts:1907

## Accessors

### walletsDir

#### Get Signature

> **get** **walletsDir**(): `string`

Defined in: packages/accounts/dist/index.d.ts:1911

`<root>/.hardkas/wallets`.

##### Returns

`string`

## Methods

### addAccount()

> **addAccount**(`ref`, `opts`): `Promise`\<[`HdWalletDescriptor`](../interfaces/HdWalletDescriptor.md)\>

Defined in: packages/accounts/dist/index.d.ts:1984

Adds the next BIP44 account (its public key derived from the phrase); needs the password and passphrase.

#### Parameters

##### ref

`string`

##### opts

###### passphrase?

`string`

###### password

`string`

#### Returns

`Promise`\<[`HdWalletDescriptor`](../interfaces/HdWalletDescriptor.md)\>

***

### changeAddress()

> **changeAddress**(`ref`, `opts?`): `Promise`\<[`HdWalletAddress`](../interfaces/HdWalletAddress.md)\>

Defined in: packages/accounts/dist/index.d.ts:1968

A change address, as `receiveAddress` (the change index advances when no index is given).

#### Parameters

##### ref

`string`

##### opts?

###### account?

`number`

###### index?

`number`

###### passphrase?

`string`

###### password?

`string`

#### Returns

`Promise`\<[`HdWalletAddress`](../interfaces/HdWalletAddress.md)\>

***

### changePassword()

> **changePassword**(`ref`, `opts`): `Promise`\<[`HdWalletDescriptor`](../interfaces/HdWalletDescriptor.md)\>

Defined in: packages/accounts/dist/index.d.ts:2002

Re-encrypts the phrase under a new password (new salt and nonce; header, KDF parameters and state kept).

#### Parameters

##### ref

`string`

##### opts

###### newPassword

`string`

###### oldPassword

`string`

#### Returns

`Promise`\<[`HdWalletDescriptor`](../interfaces/HdWalletDescriptor.md)\>

***

### create()

> **create**(`opts`): `Promise`\<[`HdWalletDescriptor`](../interfaces/HdWalletDescriptor.md)\>

Defined in: packages/accounts/dist/index.d.ts:1926

Creates a wallet with a NEW random recovery phrase (24 words by default), encrypted under `password`. The phrase
is not returned: back it up with `revealMnemonic` (explicit). Mainnet is refused before anything is generated.

#### Parameters

##### opts

###### label

`string`

###### network

`string`

###### passphrase?

`string`

###### password

`string`

###### words?

`12` \| `24`

#### Returns

`Promise`\<[`HdWalletDescriptor`](../interfaces/HdWalletDescriptor.md)\>

***

### describe()

> **describe**(`ref`): [`HdWalletDescriptor`](../interfaces/HdWalletDescriptor.md)

Defined in: packages/accounts/dist/index.d.ts:1917

One wallet's public description (nothing decrypted, `verified: false`).

#### Parameters

##### ref

`string`

#### Returns

[`HdWalletDescriptor`](../interfaces/HdWalletDescriptor.md)

***

### importMnemonic()

> **importMnemonic**(`opts`): `Promise`\<[`HdWalletDescriptor`](../interfaces/HdWalletDescriptor.md)\>

Defined in: packages/accounts/dist/index.d.ts:1934

Recovers a wallet from its BIP39 phrase (12 or 24 English words) and its passphrase, if it had one.

#### Parameters

##### opts

###### label

`string`

###### mnemonic

`string`

###### network

`string`

###### passphrase?

`string`

###### password

`string`

#### Returns

`Promise`\<[`HdWalletDescriptor`](../interfaces/HdWalletDescriptor.md)\>

***

### importWatchOnly()

> **importWatchOnly**(`opts`): `Promise`\<[`HdWalletDescriptor`](../interfaces/HdWalletDescriptor.md)\>

Defined in: packages/accounts/dist/index.d.ts:1942

A watch-only wallet from an ACCOUNT-level extended public key: addresses and balance, no keys.

#### Parameters

##### opts

###### label

`string`

###### network

`string`

###### xpub

`string`

#### Returns

`Promise`\<[`HdWalletDescriptor`](../interfaces/HdWalletDescriptor.md)\>

***

### list()

> **list**(): [`HdWalletDescriptor`](../interfaces/HdWalletDescriptor.md)[]

Defined in: packages/accounts/dist/index.d.ts:1914

Every wallet of the workspace (public header; nothing decrypted, `verified: false`).

#### Returns

[`HdWalletDescriptor`](../interfaces/HdWalletDescriptor.md)[]

***

### markUsed()

> **markUsed**(`ref`, `used`): `Promise`\<[`HdWalletDescriptor`](../interfaces/HdWalletDescriptor.md)\>

Defined in: packages/accounts/dist/index.d.ts:1978

Records that `chain`/`index` of `account` is used (a payment received there, or change sent there): the next index
offered becomes at least `index + 1`. Never moves an index back.

#### Parameters

##### ref

`string`

##### used

###### account

`number`

###### chain

`HdChain`

###### index

`number`

#### Returns

`Promise`\<[`HdWalletDescriptor`](../interfaces/HdWalletDescriptor.md)\>

***

### open()

> **open**(`ref`, `opts`): `Promise`\<`OpenedHdWallet`\>

Defined in: packages/accounts/dist/index.d.ts:1950

Opens a wallet: decrypts the phrase and recomputes its account keys; the keys stay in memory until `close()`.

#### Parameters

##### ref

`string`

##### opts

###### passphrase?

`string`

###### password

`string`

#### Returns

`Promise`\<`OpenedHdWallet`\>

***

### receiveAddress()

> **receiveAddress**(`ref`, `opts?`): `Promise`\<[`HdWalletAddress`](../interfaces/HdWalletAddress.md)\>

Defined in: packages/accounts/dist/index.d.ts:1961

A receive address. Without `index`: the next unused one, and the wallet's receive index advances. With `password`
(and the passphrase) the wallet is opened first, so the address comes from authenticated keys (`verified: true`).

#### Parameters

##### ref

`string`

##### opts?

###### account?

`number`

###### index?

`number`

###### passphrase?

`string`

###### password?

`string`

#### Returns

`Promise`\<[`HdWalletAddress`](../interfaces/HdWalletAddress.md)\>

***

### revealMnemonic()

> **revealMnemonic**(`ref`, `opts`): `Promise`\<`string`\>

Defined in: packages/accounts/dist/index.d.ts:1997

SECRET, explicit: the recovery phrase of an HD wallet (password required).

#### Parameters

##### ref

`string`

##### opts

###### passphrase?

`string`

###### password

`string`

#### Returns

`Promise`\<`string`\>

***

### verifyRecovery()

> **verifyRecovery**(`ref`, `opts`): `Promise`\<`boolean`\>

Defined in: packages/accounts/dist/index.d.ts:1992

Whether `mnemonic` (+ `passphrase`) recovers this wallet: it derives every account key the wallet records. Needs no
password; returns false (never throws) for a phrase that is not valid BIP39.

#### Parameters

##### ref

`string`

##### opts

###### mnemonic

`string`

###### passphrase?

`string`

#### Returns

`Promise`\<`boolean`\>

***

### watch()

> **watch**(`ref`, `account?`): `HdWatchKeyring`

Defined in: packages/accounts/dist/index.d.ts:1955

The watch-only view of an account from the header as written (unverified: see the module comment).

#### Parameters

##### ref

`string`

##### account?

`number`

#### Returns

`HdWatchKeyring`
