[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / verifySignedTxSemantics

# Function: verifySignedTxSemantics()

> **verifySignedTxSemantics**(`signed`, `plan?`): `object`

Defined in: [packages/tx-builder/src/verify.ts:289](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/verify.ts#L289)

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
