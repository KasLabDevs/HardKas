[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / planRelayMinimum

# Function: planRelayMinimum()

> **planRelayMinimum**(`plan`): `object`

Defined in: [packages/artifacts/src/feeVerify.ts:42](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/feeVerify.ts#L42)

ESCALÓN 2 · P9: the node's relay minimum for a plan's own transaction: MINIMUM_RELAY_FEE_RATE_SOMPI_PER_GRAM
(100 sompi) per gram of COMPUTE mass (@hardkas/tx-builder `measureRelayFee`, the rule `verifyFeeSemantics` applies to
plans). A receipt records only its transaction's overall mass (compute or storage mass, whichever binds) and the
storage mass has no relay floor, so a receipt's fee is judged against its plan's relay minimum, never against
100 × the mass it records. Undefined when it cannot be measured here: a plan without inputs, a v1-engine plan (its
compute mass depends on contract facts) or no pinned kaspa-wasm.

## Parameters

### plan

`unknown`

## Returns

`object`

### computeMass

> **computeMass**: `bigint`

### relayFeeSompi

> **relayFeeSompi**: `bigint`
