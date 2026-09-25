[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / SchemaInvariant

# Class: SchemaInvariant

Defined in: [packages/artifacts/src/invariants/definitions.ts:41](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L41)

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

Defined in: [packages/artifacts/src/invariants/definitions.ts:43](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L43)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`description`](../interfaces/Invariant.md#description)

***

### id

> `readonly` **id**: `"INVAR_SCHEMA_SUPPORT"` = `"INVAR_SCHEMA_SUPPORT"`

Defined in: [packages/artifacts/src/invariants/definitions.ts:42](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L42)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`id`](../interfaces/Invariant.md#id)

## Methods

### check()

> **check**(`context`): `Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

Defined in: [packages/artifacts/src/invariants/definitions.ts:45](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L45)

#### Parameters

##### context

[`InvariantContext`](../interfaces/InvariantContext.md)

#### Returns

`Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`check`](../interfaces/Invariant.md#check)
