[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / checkSignedAgainstPlan

# Function: checkSignedAgainstPlan()

> **checkSignedAgainstPlan**(`signedTransaction`, `plan`): [`SignedPlanCheck`](../type-aliases/SignedPlanCheck.md)

Defined in: [packages/artifacts/src/submission-fee.ts:175](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/submission-fee.ts#L175)

Is the signed transaction THE transaction the plan authorized? Inputs must match
1:1 by outpoint; outputs must be exactly the plan's payment outputs followed by its
change (same order, same amounts, same destination script). A payload that cannot
be parsed is `insufficient`; one that parses and differs is a `mismatch`.

## Parameters

### signedTransaction

#### format?

`string`

#### payload?

`unknown`

### plan

`PlanLike`

## Returns

[`SignedPlanCheck`](../type-aliases/SignedPlanCheck.md)
