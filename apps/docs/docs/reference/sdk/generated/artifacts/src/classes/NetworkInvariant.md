[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / NetworkInvariant

# Class: NetworkInvariant

Defined in: [packages/artifacts/src/invariants/definitions.ts:176](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/invariants/definitions.ts#L176)

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

Defined in: [packages/artifacts/src/invariants/definitions.ts:178](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/invariants/definitions.ts#L178)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`description`](../interfaces/Invariant.md#description)

***

### id

> `readonly` **id**: `"INVAR_NETWORK_PREFIX"` = `"INVAR_NETWORK_PREFIX"`

Defined in: [packages/artifacts/src/invariants/definitions.ts:177](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/invariants/definitions.ts#L177)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`id`](../interfaces/Invariant.md#id)

## Methods

### check()

> **check**(): `Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

Defined in: [packages/artifacts/src/invariants/definitions.ts:179](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/invariants/definitions.ts#L179)

#### Returns

`Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`check`](../interfaces/Invariant.md#check)
