[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / BasicLineageInvariant

# Class: BasicLineageInvariant

Defined in: [packages/artifacts/src/invariants/definitions.ts:115](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L115)

Basic lineage invariant: if parentArtifactId is present, it should ideally be resolvable.

## Implements

- [`Invariant`](../interfaces/Invariant.md)

## Constructors

### Constructor

> **new BasicLineageInvariant**(): `BasicLineageInvariant`

#### Returns

`BasicLineageInvariant`

## Properties

### description

> `readonly` **description**: `"Parent artifact should be resolvable if specified"` = `"Parent artifact should be resolvable if specified"`

Defined in: [packages/artifacts/src/invariants/definitions.ts:117](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L117)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`description`](../interfaces/Invariant.md#description)

***

### id

> `readonly` **id**: `"INVAR_BASIC_LINEAGE"` = `"INVAR_BASIC_LINEAGE"`

Defined in: [packages/artifacts/src/invariants/definitions.ts:116](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L116)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`id`](../interfaces/Invariant.md#id)

## Methods

### check()

> **check**(`context`): `Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

Defined in: [packages/artifacts/src/invariants/definitions.ts:119](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L119)

#### Parameters

##### context

[`InvariantContext`](../interfaces/InvariantContext.md)

#### Returns

`Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`check`](../interfaces/Invariant.md#check)
