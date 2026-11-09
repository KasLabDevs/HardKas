[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / estimateToccataZkFee

# Function: estimateToccataZkFee()

> **estimateToccataZkFee**(`computeBudget?`, `baseComputeMass?`, `options?`): [`ToccataZkFeeEstimate`](../interfaces/ToccataZkFeeEstimate.md)

Defined in: [packages/sdk/src/zk/toccata.ts:165](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/zk/toccata.ts#L165)

Minimum and recommended fee for a Toccata transaction with one ZK input.
The base compute mass must come from the real transaction (see buildR0Groth16Transaction, which
measures it with kaspa-wasm); no shape-specific constant is assumed (audit M-04).

## Parameters

### computeBudget?

`number` = `DEFAULT_ZK_COMPUTE_BUDGET`

### baseComputeMass?

`bigint` = `REFERENCE_BASE_COMPUTE_MASS`

### options?

[`ToccataFeePolicyOptions`](../interfaces/ToccataFeePolicyOptions.md) = `{}`

## Returns

[`ToccataZkFeeEstimate`](../interfaces/ToccataZkFeeEstimate.md)
