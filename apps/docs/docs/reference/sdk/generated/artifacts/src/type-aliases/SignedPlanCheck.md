[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / SignedPlanCheck

# Type Alias: SignedPlanCheck

> **SignedPlanCheck** = \{ `inputs`: `string`[]; `ok`: `true`; `outputs`: `object`[]; \} \| \{ `kind`: `"insufficient"`; `ok`: `false`; `reason`: `string`; \} \| \{ `code`: `"SIGNED_PLAN_MISMATCH"`; `kind`: `"mismatch"`; `ok`: `false`; `reason`: `string`; \}

Defined in: [packages/artifacts/src/submission-fee.ts:32](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/submission-fee.ts#L32)

The outcome of checking a signed transaction against the plan that authorized it.
