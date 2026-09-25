[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / BackendPlugin

# Interface: BackendPlugin

Defined in: [packages/core/src/plugins.ts:75](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L75)

Extend HardkasError to include plugin errors 
(We don't actually redefine it, just ensure these codes are handled where thrown)
PLUGIN_ACTION_BLOCKED
PLUGIN_HOOK_FAILED
BYPASS_HOOKS_FORBIDDEN

## Properties

### capabilities

> **capabilities**: `object`

Defined in: [packages/core/src/plugins.ts:78](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L78)

#### deterministic

> **deterministic**: `boolean`

#### externalState

> **externalState**: `boolean`

#### snapshots

> **snapshots**: `boolean`

***

### name

> **name**: `string`

Defined in: [packages/core/src/plugins.ts:76](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L76)

***

### type

> **type**: `string`

Defined in: [packages/core/src/plugins.ts:77](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L77)

## Methods

### connect()?

> `optional` **connect**(): `Promise`\<`void`\>

Defined in: [packages/core/src/plugins.ts:83](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L83)

#### Returns

`Promise`\<`void`\>

***

### disconnect()?

> `optional` **disconnect**(): `Promise`\<`void`\>

Defined in: [packages/core/src/plugins.ts:84](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/plugins.ts#L84)

#### Returns

`Promise`\<`void`\>
