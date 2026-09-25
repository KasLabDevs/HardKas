[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / EventSubscriber

# Class: EventSubscriber

Defined in: [packages/core/src/events.ts:339](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L339)

## Constructors

### Constructor

> **new EventSubscriber**(): `EventSubscriber`

#### Returns

`EventSubscriber`

## Methods

### subscribe()

> **subscribe**(`options`): `string`

Defined in: [packages/core/src/events.ts:346](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L346)

Subscribes to events by polling the underlying source at the specified interval.
Note: This is an initial V1 implementation purely based on polling.

#### Parameters

##### options

[`EventSubscribeOptions`](../interfaces/EventSubscribeOptions.md)

#### Returns

`string`

***

### unsubscribe()

> **unsubscribe**(`subId`): `void`

Defined in: [packages/core/src/events.ts:387](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/events.ts#L387)

#### Parameters

##### subId

`string`

#### Returns

`void`
