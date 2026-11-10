[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / verifyTxPlanSemantics

# Function: verifyTxPlanSemantics()

> **verifyTxPlanSemantics**(`plan`, `context?`): [`SemanticVerificationResult`](../interfaces/SemanticVerificationResult.md)

Defined in: [packages/tx-builder/src/verify.ts:57](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/verify.ts#L57)

Performs deep semantic verification of a transaction plan.
Validates economic invariants, mass computation, and operational consistency.

## Parameters

### plan

[`TxPlan`](../interfaces/TxPlan.md)

### context?

[`SemanticVerifyContext`](../interfaces/SemanticVerifyContext.md) = `{}`

## Returns

[`SemanticVerificationResult`](../interfaces/SemanticVerificationResult.md)
