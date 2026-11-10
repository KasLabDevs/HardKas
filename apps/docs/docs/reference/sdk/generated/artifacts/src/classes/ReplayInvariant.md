[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ReplayInvariant

# Class: ReplayInvariant

Defined in: [packages/artifacts/src/invariants/definitions.ts:187](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/invariants/definitions.ts#L187)

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

Defined in: [packages/artifacts/src/invariants/definitions.ts:189](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/invariants/definitions.ts#L189)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`description`](../interfaces/Invariant.md#description)

***

### id

> `readonly` **id**: `"INVAR_REPLAY_CONSISTENCY"` = `"INVAR_REPLAY_CONSISTENCY"`

Defined in: [packages/artifacts/src/invariants/definitions.ts:188](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/invariants/definitions.ts#L188)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`id`](../interfaces/Invariant.md#id)

## Methods

### check()

> **check**(): `Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

Defined in: [packages/artifacts/src/invariants/definitions.ts:190](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/invariants/definitions.ts#L190)

#### Returns

`Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`check`](../interfaces/Invariant.md#check)
