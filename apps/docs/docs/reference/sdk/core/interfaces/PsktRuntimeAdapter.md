[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / PsktRuntimeAdapter

# Interface: PsktRuntimeAdapter

Defined in: [packages/core/src/pskt-adapter.ts:48](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt-adapter.ts#L48)

## Properties

### id

> `readonly` **id**: `string`

Defined in: [packages/core/src/pskt-adapter.ts:49](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt-adapter.ts#L49)

***

### kind

> `readonly` **kind**: [`PsktAdapterKind`](../type-aliases/PsktAdapterKind.md)

Defined in: [packages/core/src/pskt-adapter.ts:50](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt-adapter.ts#L50)

***

### trustProfile

> `readonly` **trustProfile**: [`PsktAdapterTrustProfile`](PsktAdapterTrustProfile.md)

Defined in: [packages/core/src/pskt-adapter.ts:51](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt-adapter.ts#L51)

## Methods

### combine()

> **combine**(`payloads`): `Promise`\<[`PortableSigningPayload`](../type-aliases/PortableSigningPayload.md)\>

Defined in: [packages/core/src/pskt-adapter.ts:68](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt-adapter.ts#L68)

#### Parameters

##### payloads

readonly [`PortableSigningPayload`](../type-aliases/PortableSigningPayload.md)[]

#### Returns

`Promise`\<[`PortableSigningPayload`](../type-aliases/PortableSigningPayload.md)\>

***

### exportPlan()

> **exportPlan**(`plan`): `Promise`\<[`PortableSigningPayload`](../type-aliases/PortableSigningPayload.md)\>

Defined in: [packages/core/src/pskt-adapter.ts:55](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt-adapter.ts#L55)

#### Parameters

##### plan

`any`

#### Returns

`Promise`\<[`PortableSigningPayload`](../type-aliases/PortableSigningPayload.md)\>

***

### extract()

> **extract**(`payload`, `networkId`): `Promise`\<`any`\>

Defined in: [packages/core/src/pskt-adapter.ts:76](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt-adapter.ts#L76)

#### Parameters

##### payload

[`PortableSigningPayload`](../type-aliases/PortableSigningPayload.md)

##### networkId

`string`

#### Returns

`Promise`\<`any`\>

***

### finalize()

> **finalize**(`payload`): `Promise`\<[`PortableSigningPayload`](../type-aliases/PortableSigningPayload.md)\>

Defined in: [packages/core/src/pskt-adapter.ts:72](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt-adapter.ts#L72)

#### Parameters

##### payload

[`PortableSigningPayload`](../type-aliases/PortableSigningPayload.md)

#### Returns

`Promise`\<[`PortableSigningPayload`](../type-aliases/PortableSigningPayload.md)\>

***

### importPayload()

> **importPayload**(`payload`): `Promise`\<[`PsktInspection`](PsktInspection.md)\>

Defined in: [packages/core/src/pskt-adapter.ts:59](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt-adapter.ts#L59)

#### Parameters

##### payload

[`PortableSigningPayload`](../type-aliases/PortableSigningPayload.md)

#### Returns

`Promise`\<[`PsktInspection`](PsktInspection.md)\>

***

### probe()

> **probe**(): `Promise`\<[`PsktRuntimeCapabilities`](PsktRuntimeCapabilities.md)\>

Defined in: [packages/core/src/pskt-adapter.ts:53](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt-adapter.ts#L53)

#### Returns

`Promise`\<[`PsktRuntimeCapabilities`](PsktRuntimeCapabilities.md)\>

***

### sign()

> **sign**(`payload`, `request`): `Promise`\<[`PortableSigningPayload`](../type-aliases/PortableSigningPayload.md)\>

Defined in: [packages/core/src/pskt-adapter.ts:63](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/pskt-adapter.ts#L63)

#### Parameters

##### payload

[`PortableSigningPayload`](../type-aliases/PortableSigningPayload.md)

##### request

[`PsktSignRequest`](PsktSignRequest.md)

#### Returns

`Promise`\<[`PortableSigningPayload`](../type-aliases/PortableSigningPayload.md)\>
