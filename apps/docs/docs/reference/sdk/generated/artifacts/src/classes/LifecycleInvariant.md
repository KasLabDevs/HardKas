[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / LifecycleInvariant

# Class: LifecycleInvariant

Defined in: [packages/artifacts/src/invariants/definitions.ts:165](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/invariants/definitions.ts#L165)

Contract/Stub: Lifecycle invariant (ordering of events).

## Implements

- [`Invariant`](../interfaces/Invariant.md)

## Constructors

### Constructor

> **new LifecycleInvariant**(): `LifecycleInvariant`

#### Returns

`LifecycleInvariant`

## Properties

### description

> `readonly` **description**: `"Workflow events must follow valid lifecycle ordering"` = `"Workflow events must follow valid lifecycle ordering"`

Defined in: [packages/artifacts/src/invariants/definitions.ts:167](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/invariants/definitions.ts#L167)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`description`](../interfaces/Invariant.md#description)

***

### id

> `readonly` **id**: `"INVAR_LIFECYCLE_ORDER"` = `"INVAR_LIFECYCLE_ORDER"`

Defined in: [packages/artifacts/src/invariants/definitions.ts:166](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/invariants/definitions.ts#L166)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`id`](../interfaces/Invariant.md#id)

## Methods

### check()

> **check**(): `Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

Defined in: [packages/artifacts/src/invariants/definitions.ts:168](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/invariants/definitions.ts#L168)

#### Returns

`Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`check`](../interfaces/Invariant.md#check)
