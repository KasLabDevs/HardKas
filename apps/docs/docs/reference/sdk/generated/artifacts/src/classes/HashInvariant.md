[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / HashInvariant

# Class: HashInvariant

Defined in: [packages/artifacts/src/invariants/definitions.ts:8](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L8)

Verifies that the artifact's contentHash field matches the calculated hash.

## Implements

- [`Invariant`](../interfaces/Invariant.md)

## Constructors

### Constructor

> **new HashInvariant**(): `HashInvariant`

#### Returns

`HashInvariant`

## Properties

### description

> `readonly` **description**: `"Artifact content hash must match payload"` = `"Artifact content hash must match payload"`

Defined in: [packages/artifacts/src/invariants/definitions.ts:10](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L10)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`description`](../interfaces/Invariant.md#description)

***

### id

> `readonly` **id**: `"INVAR_HASH_MATCH"` = `"INVAR_HASH_MATCH"`

Defined in: [packages/artifacts/src/invariants/definitions.ts:9](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L9)

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`id`](../interfaces/Invariant.md#id)

## Methods

### check()

> **check**(`context`): `Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

Defined in: [packages/artifacts/src/invariants/definitions.ts:12](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/invariants/definitions.ts#L12)

#### Parameters

##### context

[`InvariantContext`](../interfaces/InvariantContext.md)

#### Returns

`Promise`\<[`InvariantViolation`](../interfaces/InvariantViolation.md)[]\>

#### Implementation of

[`Invariant`](../interfaces/Invariant.md).[`check`](../interfaces/Invariant.md#check)
