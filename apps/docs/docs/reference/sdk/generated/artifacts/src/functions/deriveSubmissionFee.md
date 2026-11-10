[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / deriveSubmissionFee

# Function: deriveSubmissionFee()

> **deriveSubmissionFee**(`input`): [`SubmissionFeeEvidence`](../type-aliases/SubmissionFeeEvidence.md) \| \{ `code`: `"SIGNED_PLAN_MISMATCH"`; `reason`: `string`; `status`: `"mismatch"`; \}

Defined in: [packages/artifacts/src/submission-fee.ts:242](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/submission-fee.ts#L242)

fee = Σ(consumed) − Σ(produced), ONLY for a signed transaction shown to be the one the
plan authorized (`checkSignedAgainstPlan`). A mismatch is not priced: the caller must
refuse the send. Unparseable/missing evidence yields `insufficient-evidence`.

## Parameters

### input

#### plan

`PlanLike`

#### signedTransaction

\{ `format?`: `string`; `payload?`: `unknown`; \}

#### signedTransaction.format?

`string`

#### signedTransaction.payload?

`unknown`

## Returns

[`SubmissionFeeEvidence`](../type-aliases/SubmissionFeeEvidence.md) \| \{ `code`: `"SIGNED_PLAN_MISMATCH"`; `reason`: `string`; `status`: `"mismatch"`; \}
