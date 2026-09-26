[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / verifySignedTxSemantics

# Function: verifySignedTxSemantics()

> **verifySignedTxSemantics**(`signed`, `plan?`): `object`

Defined in: [packages/tx-builder/src/verify.ts:277](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/verify.ts#L277)

Performs semantic verification of a signed transaction artifact.

## Parameters

### signed

`any`

### plan?

[`TxPlan`](../interfaces/TxPlan.md)

## Returns

`object`

### issues

> **issues**: [`SemanticVerificationIssue`](../interfaces/SemanticVerificationIssue.md)[]

### ok

> **ok**: `boolean`
