[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasHdWallets

# Class: HardkasHdWallets

Defined in: [packages/sdk/src/hd-wallet.ts:163](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L163)

HD wallet spending for one SDK instance (its workspace, node, network and records). The wallets themselves are the
workspace's `HdWalletManager` (`manager`).

## Constructors

### Constructor

> **new HardkasHdWallets**(`sdk`, `options?`): `HardkasHdWallets`

Defined in: [packages/sdk/src/hd-wallet.ts:166](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L166)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

##### options?

`Omit`\<`HdWalletManagerOptions`, `"workspaceRoot"`\> = `{}`

#### Returns

`HardkasHdWallets`

## Properties

### manager

> `readonly` **manager**: [`HdWalletManager`](HdWalletManager.md)

Defined in: [packages/sdk/src/hd-wallet.ts:164](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L164)

## Methods

### plan()

> **plan**(`ref`, `options`): `Promise`\<[`HdWalletPayment`](../interfaces/HdWalletPayment.md)\>

Defined in: [packages/sdk/src/hd-wallet.ts:467](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L467)

Plans a payment from the wallet (opened with its password); nothing is signed or sent.

#### Parameters

##### ref

`string`

##### options

[`HdWalletPaymentOptions`](../interfaces/HdWalletPaymentOptions.md)

#### Returns

`Promise`\<[`HdWalletPayment`](../interfaces/HdWalletPayment.md)\>

***

### scan()

> **scan**(`ref`, `options?`): `Promise`\<[`HdWalletScan`](../interfaces/HdWalletScan.md)\>

Defined in: [packages/sdk/src/hd-wallet.ts:279](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L279)

The wallet's balance: every address of `account` the gap-limit scan reaches. Without `password` the addresses come
from the wallet file's header as written (`verified: false`); with it the wallet is opened first.

#### Parameters

##### ref

`string`

##### options?

###### account?

`number`

###### gapLimit?

`number`

###### passphrase?

`string`

###### password?

`string`

#### Returns

`Promise`\<[`HdWalletScan`](../interfaces/HdWalletScan.md)\>

***

### send()

> **send**(`ref`, `options`): `Promise`\<[`HdWalletSendResult`](../interfaces/HdWalletSendResult.md)\>

Defined in: [packages/sdk/src/hd-wallet.ts:482](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L482)

Plans, signs and sends a payment from the wallet: the plan over every scanned address's UTXOs, each input signed by
the key of its own address, sent by `sdk.tx.send` (`send` options as there). On success the change index (and any
receive index the scan found used) is recorded, so the next payment changes to a fresh address.

#### Parameters

##### ref

`string`

##### options

[`HdWalletPaymentOptions`](../interfaces/HdWalletPaymentOptions.md) & `object`

#### Returns

`Promise`\<[`HdWalletSendResult`](../interfaces/HdWalletSendResult.md)\>
