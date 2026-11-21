[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / authorizablePlanIdentity

# Function: authorizablePlanIdentity()

> **authorizablePlanIdentity**(`plan`): `string`

Defined in: [packages/artifacts/src/signed-tx.ts:58](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/signed-tx.ts#L58)

IC-6′.2 / IC-4′.4: the authenticated identity of a plan that MAY be authorized —
sealed under the current hash version and recomputing to its declared hash. A
LEGACY plan is never authorized (migrate it first); an unsealed or tampered plan
has no identity to bind to.

## Parameters

### plan

`unknown`

## Returns

`string`
