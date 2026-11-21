[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / SignedPlanCheck

# Type Alias: SignedPlanCheck

> **SignedPlanCheck** = \{ `inputs`: `string`[]; `ok`: `true`; `outputs`: `object`[]; \} \| \{ `kind`: `"insufficient"`; `ok`: `false`; `reason`: `string`; \} \| \{ `code`: `"SIGNED_PLAN_MISMATCH"`; `kind`: `"mismatch"`; `ok`: `false`; `reason`: `string`; \}

Defined in: [packages/artifacts/src/submission-fee.ts:34](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/submission-fee.ts#L34)

The outcome of checking a signed transaction against the plan that authorized it.
