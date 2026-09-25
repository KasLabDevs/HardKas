[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / HardkasConfig

# Interface: HardkasConfig

Defined in: [packages/config/src/types.ts:67](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/config/src/types.ts#L67)

## Properties

### accounts?

> `optional` **accounts?**: `Record`\<`string`, [`HardkasAccountConfig`](../type-aliases/HardkasAccountConfig.md)\>

Defined in: [packages/config/src/types.ts:81](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/config/src/types.ts#L81)

***

### artifacts?

> `optional` **artifacts?**: `object`

Defined in: [packages/config/src/types.ts:90](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/config/src/types.ts#L90)

#### deterministic?

> `optional` **deterministic?**: `boolean`

***

### ~~defaultNetwork?~~

> `optional` **defaultNetwork?**: `string`

Defined in: [packages/config/src/types.ts:75](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/config/src/types.ts#L75)

#### Deprecated

Use `execution` instead.

***

### execution?

> `optional` **execution?**: \{ `domain`: `"kaspa-l1"` \| `"evm-l2"`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"`; `network`: `string`; \} \| \{ `default`: `string`; `targets`: `Record`\<`string`, [`HardkasExecutionTarget`](../type-aliases/HardkasExecutionTarget.md)\>; \}

Defined in: [packages/config/src/types.ts:68](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/config/src/types.ts#L68)

***

### experimental?

> `optional` **experimental?**: `boolean`

Defined in: [packages/config/src/types.ts:85](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/config/src/types.ts#L85)

***

### l2?

> `optional` **l2?**: `object`

Defined in: [packages/config/src/types.ts:82](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/config/src/types.ts#L82)

#### networks?

> `optional` **networks?**: `Record`\<`string`, `any`\>

***

### network?

> `optional` **network?**: `object`

Defined in: [packages/config/src/types.ts:76](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/config/src/types.ts#L76)

#### allowPublic?

> `optional` **allowPublic?**: `boolean`

#### default?

> `optional` **default?**: `string`

***

### networks?

> `optional` **networks?**: `Record`\<[`HardkasNetworkName`](../type-aliases/HardkasNetworkName.md), [`HardkasNetworkTarget`](../type-aliases/HardkasNetworkTarget.md)\>

Defined in: [packages/config/src/types.ts:80](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/config/src/types.ts#L80)

***

### plugins?

> `optional` **plugins?**: `any`[]

Defined in: [packages/config/src/types.ts:94](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/config/src/types.ts#L94)

***

### tasks?

> `optional` **tasks?**: `Record`\<`string`, `any`\>

Defined in: [packages/config/src/types.ts:93](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/config/src/types.ts#L93)

***

### wasm?

> `optional` **wasm?**: `object`

Defined in: [packages/config/src/types.ts:86](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/config/src/types.ts#L86)

#### path?

> `optional` **path?**: `string`

#### provider

> **provider**: `"managed"` \| `"local"` \| `"release-asset"`
