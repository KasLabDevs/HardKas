[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / ComputeGrams

# Variable: ComputeGrams

> `const` **ComputeGrams**: `object`

Defined in: [packages/core/src/domain-types.ts:95](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/domain-types.ts#L95)

Utility for converting between Kaspa script units and Compute Grams.
Toccata's computeBudget requires values in Compute Grams, not raw script units.

## Type Declaration

### fromScriptUnits()

> **fromScriptUnits**(`units`): `bigint`

Converts script units to Compute Grams.
1 Compute Gram = 10,000 script units.
Uses ceiling division to ensure we don't underfund the transaction.

#### Parameters

##### units

`number` \| `bigint`

#### Returns

`bigint`

### toScriptUnits()

> **toScriptUnits**(`grams`): `bigint`

Converts Compute Grams to raw script units.
1 Compute Gram = 10,000 script units.

#### Parameters

##### grams

`number` \| `bigint`

#### Returns

`bigint`
