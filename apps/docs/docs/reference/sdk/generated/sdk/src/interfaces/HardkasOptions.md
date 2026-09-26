[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasOptions

# Interface: HardkasOptions

Defined in: [packages/sdk/src/index.ts:129](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L129)

## Properties

### autoBootstrap?

> `optional` **autoBootstrap?**: `boolean`

Defined in: [packages/sdk/src/index.ts:136](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L136)

***

### configPath?

> `optional` **configPath?**: `string`

Defined in: [packages/sdk/src/index.ts:131](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L131)

***

### cwd?

> `optional` **cwd?**: `string`

Defined in: [packages/sdk/src/index.ts:130](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L130)

***

### hardkasDir?

> `optional` **hardkasDir?**: `string`

Defined in: [packages/sdk/src/index.ts:133](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L133)

***

### logger?

> `optional` **logger?**: `object`

Defined in: [packages/sdk/src/index.ts:138](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L138)

#### Index Signature

\[`key`: `string`\]: `any`

#### debug

> **debug**: (`msg`) => `void`

##### Parameters

###### msg

`string`

##### Returns

`void`

#### error

> **error**: (`msg`) => `void`

##### Parameters

###### msg

`string`

##### Returns

`void`

#### info

> **info**: (`msg`) => `void`

##### Parameters

###### msg

`string`

##### Returns

`void`

#### warn

> **warn**: (`msg`) => `void`

##### Parameters

###### msg

`string`

##### Returns

`void`

***

### mode?

> `optional` **mode?**: `"developer"` \| `"agent"`

Defined in: [packages/sdk/src/index.ts:134](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L134)

***

### network?

> `optional` **network?**: `string`

Defined in: [packages/sdk/src/index.ts:135](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L135)

***

### policy?

> `optional` **policy?**: `object`

Defined in: [packages/sdk/src/index.ts:145](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L145)

#### allowExternalWallet?

> `optional` **allowExternalWallet?**: `boolean`

#### allowNetwork?

> `optional` **allowNetwork?**: `boolean`

#### allowPublic?

> `optional` **allowPublic?**: `boolean`

#### requireDryRun?

> `optional` **requireDryRun?**: `boolean`

***

### signer?

> `optional` **signer?**: `ExternalHardkasSigner`

Defined in: [packages/sdk/src/index.ts:137](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L137)

***

### wasm?

> `optional` **wasm?**: `object`

Defined in: [packages/sdk/src/index.ts:151](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L151)

#### path?

> `optional` **path?**: `string`

#### provider

> **provider**: `"managed"` \| `"local"` \| `"release-asset"`

***

### workspaceRoot?

> `optional` **workspaceRoot?**: `string`

Defined in: [packages/sdk/src/index.ts:132](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/index.ts#L132)
