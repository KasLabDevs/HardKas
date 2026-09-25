[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / NetworkInvariant

# Class: NetworkInvariant

Defined in: [packages/artifacts/src/invariants/definitions.ts:162](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L162)

Contract/Stub: Network invariant (address prefix matching).

## Implements

- [`Invariant`](../interfaces/Invariant.md)

## Constructors

### Constructor

> **new NetworkInvariant**(): `NetworkInvariant`

#### Returns

`NetworkInvariant`

## Properties

### description

> `readonly` **description**: `"Network ID must match address prefixes"` = `"Network ID must match address prefixes"`

Defined in: [packages/artifacts/src/invariants/definitions.ts:164](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L164)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`description`](../interfaces/Invariant.md#description)

***

### id

> `readonly` **id**: `"INVAR_NETWORK_PREFIX"` = `"INVAR_NETWORK_PREFIX"`

Defined in: [packages/artifacts/src/invariants/definitions.ts:163](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L163)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`id`](../interfaces/Invariant.md#id)

## Methods

### check()

> **check**(): `Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

Defined in: [packages/artifacts/src/invariants/definitions.ts:165](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L165)

#### Returns

`Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`check`](../interfaces/Invariant.md#check)
