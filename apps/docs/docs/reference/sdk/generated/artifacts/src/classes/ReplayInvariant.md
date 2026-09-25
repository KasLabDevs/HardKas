[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ReplayInvariant

# Class: ReplayInvariant

Defined in: [packages/artifacts/src/invariants/definitions.ts:173](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L173)

Contract/Stub: Replay invariant (re-execution consistency).

## Implements

- [`Invariant`](../interfaces/Invariant.md)

## Constructors

### Constructor

> **new ReplayInvariant**(): `ReplayInvariant`

#### Returns

`ReplayInvariant`

## Properties

### description

> `readonly` **description**: `"Replay execution must produce consistent results"` = `"Replay execution must produce consistent results"`

Defined in: [packages/artifacts/src/invariants/definitions.ts:175](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L175)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`description`](../interfaces/Invariant.md#description)

***

### id

> `readonly` **id**: `"INVAR_REPLAY_CONSISTENCY"` = `"INVAR_REPLAY_CONSISTENCY"`

Defined in: [packages/artifacts/src/invariants/definitions.ts:174](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L174)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`id`](../interfaces/Invariant.md#id)

## Methods

### check()

> **check**(): `Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

Defined in: [packages/artifacts/src/invariants/definitions.ts:176](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L176)

#### Returns

`Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`check`](../interfaces/Invariant.md#check)
