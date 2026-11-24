[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / TxObserverRpc

# Interface: TxObserverRpc

Defined in: [packages/sdk/src/tx-observer.ts:18](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx-observer.ts#L18)

The five reads an observation needs, so tests can script a node without a socket.

## Methods

### getBlockDagInfo()

> **getBlockDagInfo**(): `Promise`\<\{ `networkId`: `string`; `pruningPointHash?`: `string`; `serverVersion?`: `string`; `sink`: `string`; `virtualDaaScore`: `bigint`; \}\>

Defined in: [packages/sdk/src/tx-observer.ts:19](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx-observer.ts#L19)

#### Returns

`Promise`\<\{ `networkId`: `string`; `pruningPointHash?`: `string`; `serverVersion?`: `string`; `sink`: `string`; `virtualDaaScore`: `bigint`; \}\>

***

### getBlockHeader()

> **getBlockHeader**(`hash`): `Promise`\<\{ `blueScore`: `bigint`; `daaScore`: `bigint`; \}\>

Defined in: [packages/sdk/src/tx-observer.ts:28](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx-observer.ts#L28)

#### Parameters

##### hash

`string`

#### Returns

`Promise`\<\{ `blueScore`: `bigint`; `daaScore`: `bigint`; \}\>

***

### getMempoolEntry()

> **getMempoolEntry**(`txId`): `Promise`\<\{ `feeSompi?`: `string`; `isOrphan`: `boolean`; \}\>

Defined in: [packages/sdk/src/tx-observer.ts:22](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx-observer.ts#L22)

`null` when the node answers "not found"; transport errors propagate.

#### Parameters

##### txId

`string`

#### Returns

`Promise`\<\{ `feeSompi?`: `string`; `isOrphan`: `boolean`; \}\>

***

### getSinkBlueScore()

> **getSinkBlueScore**(): `Promise`\<`bigint`\>

Defined in: [packages/sdk/src/tx-observer.ts:20](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx-observer.ts#L20)

#### Returns

`Promise`\<`bigint`\>

***

### getVirtualChainFromBlock()

> **getVirtualChainFromBlock**(`startHash`): `Promise`\<\{ `acceptedTransactionIds`: `object`[]; `addedChainBlockHashes`: `string`[]; `removedChainBlockHashes`: `string`[]; \}\>

Defined in: [packages/sdk/src/tx-observer.ts:23](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/tx-observer.ts#L23)

#### Parameters

##### startHash

`string`

#### Returns

`Promise`\<\{ `acceptedTransactionIds`: `object`[]; `addedChainBlockHashes`: `string`[]; `removedChainBlockHashes`: `string`[]; \}\>
