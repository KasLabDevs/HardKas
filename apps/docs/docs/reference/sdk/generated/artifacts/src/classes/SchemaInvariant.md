[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / SchemaInvariant

# Class: SchemaInvariant

Defined in: [packages/artifacts/src/invariants/definitions.ts:55](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/invariants/definitions.ts#L55)

Verifies that the artifact schema and version are supported.

## Implements

- [`Invariant`](../interfaces/Invariant.md)

## Constructors

### Constructor

> **new SchemaInvariant**(): `SchemaInvariant`

#### Returns

`SchemaInvariant`

## Properties

### description

> `readonly` **description**: `"Artifact schema and version must be supported"` = `"Artifact schema and version must be supported"`

Defined in: [packages/artifacts/src/invariants/definitions.ts:57](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/invariants/definitions.ts#L57)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`description`](../interfaces/Invariant.md#description)

***

### id

> `readonly` **id**: `"INVAR_SCHEMA_SUPPORT"` = `"INVAR_SCHEMA_SUPPORT"`

Defined in: [packages/artifacts/src/invariants/definitions.ts:56](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/invariants/definitions.ts#L56)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`id`](../interfaces/Invariant.md#id)

## Methods

### check()

> **check**(`context`): `Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

Defined in: [packages/artifacts/src/invariants/definitions.ts:59](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/invariants/definitions.ts#L59)

#### Parameters

##### context

[`InvariantContext`](../interfaces/InvariantContext.md)

#### Returns

`Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`check`](../interfaces/Invariant.md#check)
