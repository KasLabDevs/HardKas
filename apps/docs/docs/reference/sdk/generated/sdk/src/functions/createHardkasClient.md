[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / createHardkasClient

# Function: createHardkasClient()

> **createHardkasClient**(`options?`): `object`

Defined in: [packages/sdk/src/client.ts:21](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/client.ts#L21)

## Parameters

### options?

[`HardkasClientOptions`](../interfaces/HardkasClientOptions.md) = `{}`

## Returns

`object`

### accounts

> **accounts**: `object`

#### accounts.list

> **list**: () => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`[]\>\>

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`[]\>\>

### artifacts

> **artifacts**: `object`

#### artifacts.explain

> **explain**: (`id`) => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### id

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

#### artifacts.replay

> **replay**: (`id`) => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### id

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

#### artifacts.watch

> **watch**: (`callback`, `options?`) => () => `void`

##### Parameters

###### callback

(`artifact`) => `void`

###### options?

###### intervalMs?

`number`

###### lineage?

`boolean`

###### replay?

`boolean`

###### transport?

`"sse"` \| `"poll"`

###### type?

`string`

##### Returns

() => `void`

### dev

> **dev**: `object`

#### dev.status

> **status**: () => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

### localnet

> **localnet**: `object`

#### localnet.status

> **status**: () => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

### session

> **session**: `object`

#### session.diffReplay

> **diffReplay**: (`artifactId`) => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### artifactId

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

#### session.export

> **export**: () => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

#### session.import

> **import**: (`data`, `force?`) => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### data

`any`

###### force?

`boolean`

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

#### session.replay

> **replay**: (`options?`) => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### options?

###### strict?

`boolean`

###### untilArtifact?

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

#### session.snapshot

> **snapshot**: () => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

#### session.start

> **start**: () => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

#### session.timeTravel

> **timeTravel**: (`artifactId`) => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### artifactId

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

### tx

> **tx**: `object`

#### tx.plan

> **plan**: (`params`) => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### params

###### amountSompi

`string`

###### feeRate?

`string`

###### from

`string`

###### to

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

#### tx.receipt

> **receipt**: (`id`) => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### id

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

#### tx.send

> **send**: (`params`) => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### params

###### allowDevAutoSign?

`boolean`

###### amountSompi?

`string`

###### feeRate?

`string`

###### from?

`string`

###### signedTxId?

`string`

###### to?

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

#### tx.sign

> **sign**: (`params`) => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### params

###### account

`string`

###### planId

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

### workflow

> **workflow**: `object`

#### workflow.transfer

> **transfer**: (`params`) => `Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>

##### Parameters

###### params

###### allowDevAutoSign?

`boolean`

###### amountSompi

`string`

###### feeRate?

`string`

###### from

`string`

###### to

`string`

##### Returns

`Promise`\<[`ClientEnvelope`](../interfaces/ClientEnvelope.md)\<`any`\>\>
