[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / HardkasPlugin

# Interface: HardkasPlugin

Defined in: [packages/core/src/plugins.ts:15](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L15)

## Properties

### capabilities?

> `optional` **capabilities?**: `object`

Defined in: [packages/core/src/plugins.ts:19](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L19)

#### claims?

> `optional` **claims?**: `object`

##### claims.mainnetReady?

> `optional` **mainnetReady?**: `boolean`

#### requiresMutation?

> `optional` **requiresMutation?**: `boolean`

#### requiresNetwork?

> `optional` **requiresNetwork?**: `boolean`

***

### extendEnvironment?

> `optional` **extendEnvironment?**: (`hk`) => `void`

Defined in: [packages/core/src/plugins.ts:28](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L28)

#### Parameters

##### hk

`any`

#### Returns

`void`

***

### hardkasVersion

> **hardkasVersion**: `string`

Defined in: [packages/core/src/plugins.ts:18](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L18)

***

### hooks?

> `optional` **hooks?**: [`HardkasPluginHooks`](HardkasPluginHooks.md)

Defined in: [packages/core/src/plugins.ts:27](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L27)

***

### name

> **name**: `string`

Defined in: [packages/core/src/plugins.ts:16](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L16)

***

### tasks?

> `optional` **tasks?**: `Record`\<`string`, [`TaskDefinition`](TaskDefinition.md)\<`any`, `any`\>\>

Defined in: [packages/core/src/plugins.ts:26](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L26)

***

### version

> **version**: `string`

Defined in: [packages/core/src/plugins.ts:17](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L17)
