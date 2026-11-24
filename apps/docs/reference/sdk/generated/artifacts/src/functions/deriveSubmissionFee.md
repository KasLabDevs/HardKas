[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / deriveSubmissionFee

# Function: deriveSubmissionFee()

> **deriveSubmissionFee**(`input`): [`SubmissionFeeEvidence`](../type-aliases/SubmissionFeeEvidence.md) \| \{ `code`: `"SIGNED_PLAN_MISMATCH"`; `reason`: `string`; `status`: `"mismatch"`; \}

Defined in: [packages/artifacts/src/submission-fee.ts:262](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/submission-fee.ts#L262)

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
