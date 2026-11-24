[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / AddressWatchHandle

# Interface: AddressWatchHandle

Defined in: packages/toolkit/dist/watch.d.ts:145

WATCH-CLI-1 · what watchAddress returns.

## Properties

### networkId

> `readonly` **networkId**: `string`

Defined in: packages/toolkit/dist/watch.d.ts:156

The network the node named.

## Methods

### balance()

> **balance**(): `object`

Defined in: packages/toolkit/dist/watch.d.ts:150

#### Returns

`object`

##### mature

> **mature**: `bigint`

##### pending

> **pending**: `bigint`

##### stasisCount

> **stasisCount**: `number`

***

### stop()

> **stop**(): `Promise`\<`void`\>

Defined in: packages/toolkit/dist/watch.d.ts:147

Stops the watch and releases its client.

#### Returns

`Promise`\<`void`\>

***

### utxos()

> **utxos**(): `WalletWatchUtxo`[]

Defined in: packages/toolkit/dist/watch.d.ts:149

The address's UTXOs (mature and pending) as the watch sees them now.

#### Returns

`WalletWatchUtxo`[]
