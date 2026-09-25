[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / HardkasPluginHooks

# Interface: HardkasPluginHooks

Defined in: [packages/core/src/plugins.ts:4](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L4)

## Properties

### onArtifactWritten?

> `optional` **onArtifactWritten?**: (`ctx`) => `Promise`\<`void`\>

Defined in: [packages/core/src/plugins.ts:6](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L6)

#### Parameters

##### ctx

[`ArtifactWrittenContext`](ArtifactWrittenContext.md)

#### Returns

`Promise`\<`void`\>

***

### onBeforeArtifactWrite?

> `optional` **onBeforeArtifactWrite?**: (`ctx`) => `Promise`\<`void`\>

Defined in: [packages/core/src/plugins.ts:5](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L5)

#### Parameters

##### ctx

[`BeforeArtifactWriteContext`](BeforeArtifactWriteContext.md)

#### Returns

`Promise`\<`void`\>

***

### onBeforeTxSend?

> `optional` **onBeforeTxSend?**: (`ctx`) => `Promise`\<`void`\>

Defined in: [packages/core/src/plugins.ts:11](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L11)

#### Parameters

##### ctx

[`BeforeTxSendContext`](BeforeTxSendContext.md)

#### Returns

`Promise`\<`void`\>

***

### onBeforeTxSign?

> `optional` **onBeforeTxSign?**: (`ctx`) => `Promise`\<`void`\>

Defined in: [packages/core/src/plugins.ts:8](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L8)

#### Parameters

##### ctx

[`BeforeTxSignContext`](BeforeTxSignContext.md)

#### Returns

`Promise`\<`void`\>

***

### onTxSent?

> `optional` **onTxSent?**: (`ctx`) => `Promise`\<`void`\>

Defined in: [packages/core/src/plugins.ts:12](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L12)

#### Parameters

##### ctx

[`TxSentContext`](TxSentContext.md)

#### Returns

`Promise`\<`void`\>

***

### onTxSigned?

> `optional` **onTxSigned?**: (`ctx`) => `Promise`\<`void`\>

Defined in: [packages/core/src/plugins.ts:9](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L9)

#### Parameters

##### ctx

[`TxSignedContext`](TxSignedContext.md)

#### Returns

`Promise`\<`void`\>
