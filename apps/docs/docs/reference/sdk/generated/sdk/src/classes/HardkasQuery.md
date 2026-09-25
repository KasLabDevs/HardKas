[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasQuery

# Class: HardkasQuery

Defined in: [packages/sdk/src/query.ts:11](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/query.ts#L11)

**`Alpha`**

HardKAS Operational Query Module

## Constructors

### Constructor

> **new HardkasQuery**(`sdk`): `HardkasQuery`

Defined in: [packages/sdk/src/query.ts:15](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/query.ts#L15)

**`Alpha`**

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasQuery`

## Accessors

### store

#### Get Signature

> **get** **store**(): `object`

Defined in: [packages/sdk/src/query.ts:185](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/query.ts#L185)

**`Alpha`**

Direct SQL access to the internal Query Store.

##### Deprecated

use hardkas.events / hardkas.store in a future release.

##### Returns

`object`

###### ~~query~~

> **query**: (`sql`, `options?`) => `Promise`\<`any`\>

###### Parameters

###### sql

`string`

###### options?

###### unsafeWrite?

`boolean`

###### yes?

`boolean`

###### Returns

`Promise`\<`any`\>

## Methods

### balance()

> **balance**(`address`): `Promise`\<`QueryResponse`\<`bigint`\>\>

Defined in: [packages/sdk/src/query.ts:28](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/query.ts#L28)

**`Alpha`**

#### Parameters

##### address

`string`

#### Returns

`Promise`\<`QueryResponse`\<`bigint`\>\>

***

### block()

> **block**(`hash`): `Promise`\<`QueryResponse`\<`any`\>\>

Defined in: [packages/sdk/src/query.ts:60](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/query.ts#L60)

**`Alpha`**

#### Parameters

##### hash

`string`

#### Returns

`Promise`\<`QueryResponse`\<`any`\>\>

***

### confirmations()

> **confirmations**(`txid`): `Promise`\<`QueryResponse`\<`number`\>\>

Defined in: [packages/sdk/src/query.ts:52](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/query.ts#L52)

**`Alpha`**

#### Parameters

##### txid

`string`

#### Returns

`Promise`\<`QueryResponse`\<`number`\>\>

***

### ~~events()~~

> **events**(`filter?`): `Promise`\<readonly `EventEnvelope`\<`EventKind`\>[]\>

Defined in: [packages/sdk/src/query.ts:156](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/query.ts#L156)

**`Alpha`**

Fetches events from the query store.

#### Parameters

##### filter?

###### artifactId?

`string`

###### correlationId?

`string`

###### domain?

`string`

###### kind?

`string`

#### Returns

`Promise`\<readonly `EventEnvelope`\<`EventKind`\>[]\>

#### Deprecated

use hardkas.events / hardkas.store in a future release.

***

### getSpendableUtxos()

> **getSpendableUtxos**(`request`): `Promise`\<`QueryResponse`\<`any`[]\>\>

Defined in: [packages/sdk/src/query.ts:36](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/query.ts#L36)

**`Alpha`**

#### Parameters

##### request

###### address

`string`

###### excludeOutpoints?

`Set`\<`string`\>

###### excludePending?

`boolean`

#### Returns

`Promise`\<`QueryResponse`\<`any`[]\>\>

***

### history()

> **history**(`address`): `Promise`\<`QueryResponse`\<`any`[]\>\>

Defined in: [packages/sdk/src/query.ts:44](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/query.ts#L44)

**`Alpha`**

#### Parameters

##### address

`string`

#### Returns

`Promise`\<`QueryResponse`\<`any`[]\>\>

***

### mempool()

> **mempool**(`txid?`): `Promise`\<`QueryResponse`\<`any`\>\>

Defined in: [packages/sdk/src/query.ts:56](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/query.ts#L56)

**`Alpha`**

#### Parameters

##### txid?

`string`

#### Returns

`Promise`\<`QueryResponse`\<`any`\>\>

***

### network()

> **network**(): `Promise`\<`QueryResponse`\<`any`\>\>

Defined in: [packages/sdk/src/query.ts:64](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/query.ts#L64)

**`Alpha`**

#### Returns

`Promise`\<`QueryResponse`\<`any`\>\>

***

### ~~sync()~~

> **sync**(`options?`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/query.ts:92](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/query.ts#L92)

**`Alpha`**

Synchronizes the query store with the filesystem artifacts.

#### Parameters

##### options?

###### force?

`boolean`

#### Returns

`Promise`\<`any`\>

#### Deprecated

use hardkas.events / hardkas.store in a future release.

***

### syncStatus()

> **syncStatus**(): `Promise`\<`QueryResponse`\<`any`\>\>

Defined in: [packages/sdk/src/query.ts:68](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/query.ts#L68)

**`Alpha`**

#### Returns

`Promise`\<`QueryResponse`\<`any`\>\>

***

### transaction()

> **transaction**(`txid`): `Promise`\<`QueryResponse`\<`any`\>\>

Defined in: [packages/sdk/src/query.ts:48](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/query.ts#L48)

**`Alpha`**

#### Parameters

##### txid

`string`

#### Returns

`Promise`\<`QueryResponse`\<`any`\>\>

***

### utxos()

> **utxos**(`address`): `Promise`\<`QueryResponse`\<`any`[]\>\>

Defined in: [packages/sdk/src/query.ts:32](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/query.ts#L32)

**`Alpha`**

#### Parameters

##### address

`string`

#### Returns

`Promise`\<`QueryResponse`\<`any`[]\>\>
