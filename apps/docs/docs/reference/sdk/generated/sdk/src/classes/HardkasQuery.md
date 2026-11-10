[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasQuery

# Class: HardkasQuery

Defined in: [packages/sdk/src/query.ts:11](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/query.ts#L11)

**`Alpha`**

HardKAS Operational Query Module

## Constructors

### Constructor

> **new HardkasQuery**(`sdk`): `HardkasQuery`

Defined in: [packages/sdk/src/query.ts:15](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/query.ts#L15)

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

Defined in: [packages/sdk/src/query.ts:191](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/query.ts#L191)

**`Alpha`**

Direct SQL access to the internal Query Store.

##### Deprecated

use hardkas.store in a future release.

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

Defined in: [packages/sdk/src/query.ts:28](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/query.ts#L28)

**`Alpha`**

#### Parameters

##### address

`string`

#### Returns

`Promise`\<`QueryResponse`\<`bigint`\>\>

***

### block()

> **block**(`hash`): `Promise`\<`QueryResponse`\<`any`\>\>

Defined in: [packages/sdk/src/query.ts:61](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/query.ts#L61)

**`Alpha`**

#### Parameters

##### hash

`string`

#### Returns

`Promise`\<`QueryResponse`\<`any`\>\>

***

### confirmations()

> **confirmations**(`txid`): `Promise`\<`QueryResponse`\<`number`\>\>

Defined in: [packages/sdk/src/query.ts:53](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/query.ts#L53)

**`Alpha`**

#### Parameters

##### txid

`string`

#### Returns

`Promise`\<`QueryResponse`\<`number`\>\>

***

### ~~events()~~

> **events**(`filter?`): `Promise`\<readonly `EventEnvelope`\<`EventKind`\>[]\>

Defined in: [packages/sdk/src/query.ts:162](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/query.ts#L162)

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

use hardkas.store in a future release.

***

### getSpendableUtxos()

> **getSpendableUtxos**(`request`): `Promise`\<`QueryResponse`\<`any`[]\>\>

Defined in: [packages/sdk/src/query.ts:36](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/query.ts#L36)

**`Alpha`**

#### Parameters

##### request

###### address

`string`

###### excludeOutpoints?

`Set`\<`string`\>

###### excludePending?

`boolean`

###### observedAtDaaScore?

`bigint`

#### Returns

`Promise`\<`QueryResponse`\<`any`[]\>\>

***

### history()

> **history**(`address`): `Promise`\<`QueryResponse`\<`any`[]\>\>

Defined in: [packages/sdk/src/query.ts:45](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/query.ts#L45)

**`Alpha`**

#### Parameters

##### address

`string`

#### Returns

`Promise`\<`QueryResponse`\<`any`[]\>\>

***

### mempool()

> **mempool**(`txid?`): `Promise`\<`QueryResponse`\<`any`\>\>

Defined in: [packages/sdk/src/query.ts:57](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/query.ts#L57)

**`Alpha`**

#### Parameters

##### txid?

`string`

#### Returns

`Promise`\<`QueryResponse`\<`any`\>\>

***

### network()

> **network**(): `Promise`\<`QueryResponse`\<`any`\>\>

Defined in: [packages/sdk/src/query.ts:65](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/query.ts#L65)

**`Alpha`**

#### Returns

`Promise`\<`QueryResponse`\<`any`\>\>

***

### ~~sync()~~

> **sync**(`options?`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/query.ts:93](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/query.ts#L93)

**`Alpha`**

Synchronizes the query store with the filesystem artifacts.

#### Parameters

##### options?

###### force?

`boolean`

#### Returns

`Promise`\<`any`\>

#### Deprecated

use hardkas.store in a future release.

***

### syncStatus()

> **syncStatus**(): `Promise`\<`QueryResponse`\<`any`\>\>

Defined in: [packages/sdk/src/query.ts:69](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/query.ts#L69)

**`Alpha`**

#### Returns

`Promise`\<`QueryResponse`\<`any`\>\>

***

### transaction()

> **transaction**(`txid`): `Promise`\<`QueryResponse`\<`any`\>\>

Defined in: [packages/sdk/src/query.ts:49](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/query.ts#L49)

**`Alpha`**

#### Parameters

##### txid

`string`

#### Returns

`Promise`\<`QueryResponse`\<`any`\>\>

***

### utxos()

> **utxos**(`address`): `Promise`\<`QueryResponse`\<`any`[]\>\>

Defined in: [packages/sdk/src/query.ts:32](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/query.ts#L32)

**`Alpha`**

#### Parameters

##### address

`string`

#### Returns

`Promise`\<`QueryResponse`\<`any`[]\>\>
