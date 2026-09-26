[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / EventSubscribeOptions

# Interface: EventSubscribeOptions

Defined in: [packages/core/src/events.ts:330](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L330)

Basic Event Subscriber based on polling (V1).
Abstracts the polling loop over a WalletQuery to emit events.

## Properties

### handler

> **handler**: (`event`) => `void`

Defined in: [packages/core/src/events.ts:335](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L335)

#### Parameters

##### event

`any`

#### Returns

`void`

***

### intervalMs

> **intervalMs**: `number`

Defined in: [packages/core/src/events.ts:333](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L333)

***

### onError?

> `optional` **onError?**: (`err`) => `void`

Defined in: [packages/core/src/events.ts:336](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L336)

#### Parameters

##### err

`Error`

#### Returns

`void`

***

### source

> **source**: `any`

Defined in: [packages/core/src/events.ts:331](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L331)

***

### type

> **type**: `"payment"`

Defined in: [packages/core/src/events.ts:332](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L332)

***

### watchedAddresses

> **watchedAddresses**: `string`[]

Defined in: [packages/core/src/events.ts:334](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L334)
