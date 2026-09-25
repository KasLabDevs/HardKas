[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / Invariant

# Interface: Invariant

Defined in: [packages/artifacts/src/invariants/types.ts:36](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/types.ts#L36)

Core Invariant interface.

## Properties

### description

> `readonly` **description**: `string`

Defined in: [packages/artifacts/src/invariants/types.ts:38](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/types.ts#L38)

***

### id

> `readonly` **id**: `string`

Defined in: [packages/artifacts/src/invariants/types.ts:37](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/types.ts#L37)

## Methods

### check()

> **check**(`context`): `Promise`\<[`InvariantViolation`](InvariantViolation.md)[]\>

Defined in: [packages/artifacts/src/invariants/types.ts:39](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/types.ts#L39)

#### Parameters

##### context

[`InvariantContext`](InvariantContext.md)

#### Returns

`Promise`\<[`InvariantViolation`](InvariantViolation.md)[]\>
