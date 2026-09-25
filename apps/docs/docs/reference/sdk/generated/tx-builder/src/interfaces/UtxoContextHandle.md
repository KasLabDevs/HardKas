[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / UtxoContextHandle

# Interface: UtxoContextHandle

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:114](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L114)

UtxoContext lifecycle handle. Wraps a `UtxoProcessor` and a `UtxoContext`,
tracks the given addresses, and exposes mature/pending/balance directly from
upstream. Callers are responsible for calling `stop()` on teardown.

Requires an already-connected wasm `RpcClient` (obtain it from your own
caller code; this adapter does not open connections).

## Properties

### context

> `readonly` **context**: `any`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:115](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L115)

***

### processor

> `readonly` **processor**: `any`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:116](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L116)

## Methods

### balance()

> **balance**(): `any`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:121](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L121)

#### Returns

`any`

***

### clear()

> **clear**(): `Promise`\<`void`\>

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:123](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L123)

#### Returns

`Promise`\<`void`\>

***

### matureLength()

> **matureLength**(): `number`

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:122](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L122)

#### Returns

`number`

***

### matureRange()

> **matureRange**(`from`, `to`): `any`[]

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:119](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L119)

#### Parameters

##### from

`number`

##### to

`number`

#### Returns

`any`[]

***

### pending()

> **pending**(): `any`[]

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:120](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L120)

#### Returns

`any`[]

***

### stop()

> **stop**(): `Promise`\<`void`\>

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:124](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L124)

#### Returns

`Promise`\<`void`\>

***

### trackAddresses()

> **trackAddresses**(`addresses`): `Promise`\<`void`\>

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:117](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L117)

#### Parameters

##### addresses

readonly `any`[]

#### Returns

`Promise`\<`void`\>

***

### unregisterAddresses()

> **unregisterAddresses**(`addresses`): `Promise`\<`void`\>

Defined in: [packages/tx-builder/src/kaspa-wallet-adapter.ts:118](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/kaspa-wallet-adapter.ts#L118)

#### Parameters

##### addresses

readonly `any`[]

#### Returns

`Promise`\<`void`\>
