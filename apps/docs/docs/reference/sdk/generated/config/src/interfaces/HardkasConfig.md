[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / HardkasConfig

# Interface: HardkasConfig

Defined in: [packages/config/src/types.ts:75](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L75)

## Properties

### accounts?

> `optional` **accounts?**: `Record`\<`string`, [`HardkasAccountConfig`](../type-aliases/HardkasAccountConfig.md)\>

Defined in: [packages/config/src/types.ts:89](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L89)

***

### artifacts?

> `optional` **artifacts?**: `object`

Defined in: [packages/config/src/types.ts:103](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L103)

#### deterministic?

> `optional` **deterministic?**: `boolean`

***

### ~~defaultNetwork?~~

> `optional` **defaultNetwork?**: `string`

Defined in: [packages/config/src/types.ts:83](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L83)

#### Deprecated

Use `execution` instead.

***

### execution?

> `optional` **execution?**: \{ `domain`: `"kaspa-l1"` \| `"evm-l2"`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"`; `network`: `string`; \} \| \{ `default`: `string`; `targets`: `Record`\<`string`, [`HardkasExecutionTarget`](../type-aliases/HardkasExecutionTarget.md)\>; \}

Defined in: [packages/config/src/types.ts:76](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L76)

***

### experimental?

> `optional` **experimental?**: `boolean`

Defined in: [packages/config/src/types.ts:98](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L98)

***

### extensions?

> `optional` **extensions?**: `Record`\<`string`, `boolean`\>

Defined in: [packages/config/src/types.ts:97](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L97)

First-party extensions installed in the project are enabled by default; `false` keeps one from loading
(e.g. `extensions: { l2: false }`).

***

### l2?

> `optional` **l2?**: `object`

Defined in: [packages/config/src/types.ts:90](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L90)

#### networks?

> `optional` **networks?**: `Record`\<`string`, `any`\>

***

### network?

> `optional` **network?**: `object`

Defined in: [packages/config/src/types.ts:84](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L84)

#### allowPublic?

> `optional` **allowPublic?**: `boolean`

#### default?

> `optional` **default?**: `string`

***

### networks?

> `optional` **networks?**: `Record`\<[`HardkasNetworkName`](../type-aliases/HardkasNetworkName.md), [`HardkasNetworkTarget`](../type-aliases/HardkasNetworkTarget.md)\>

Defined in: [packages/config/src/types.ts:88](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L88)

***

### plugins?

> `optional` **plugins?**: `any`[]

Defined in: [packages/config/src/types.ts:107](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L107)

***

### tasks?

> `optional` **tasks?**: `Record`\<`string`, `any`\>

Defined in: [packages/config/src/types.ts:106](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L106)

***

### wasm?

> `optional` **wasm?**: `object`

Defined in: [packages/config/src/types.ts:99](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/types.ts#L99)

#### path?

> `optional` **path?**: `string`

#### provider

> **provider**: `"managed"` \| `"local"` \| `"release-asset"`
