[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / finalizeTxPlanIdentity

# Function: finalizeTxPlanIdentity()

> **finalizeTxPlanIdentity**\<`T`\>(`plan`): `T` & `object`

Defined in: [packages/artifacts/src/tx-plan.ts:64](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/tx-plan.ts#L64)

Seals a plan's identity after every authenticated field is in place: one
hash, the derived label and the exact-path self reference. Callers that add
fields to a plan (policy references, profiles) call this again on the final
body; nothing may change afterwards (IC-1′.4).

## Type Parameters

### T

`T` *extends* `object`

## Parameters

### plan

`T` & `object`

## Returns

`T` & `object`
