[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / assertV1PlanShape

# Function: assertV1PlanShape()

> **assertV1PlanShape**(`plan`): `object`

Defined in: [packages/tx-builder/src/v1-plan.ts:272](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-plan.ts#L272)

Checks the shape of a v1 plan (and that a v0 plan carries no v1 field). Throws V1_PLAN_INVALID with `reason`,
V1_FEE_LIMIT_REQUIRED, FEE_EXCEEDS_MAX or COVENANT_P2PK_INPUT_NOT_SUPPORTED. Returns the plan's fee.

## Parameters

### plan

`Record`\<`string`, `any`\>

## Returns

`object`

### feeSompi

> **feeSompi**: `bigint`
