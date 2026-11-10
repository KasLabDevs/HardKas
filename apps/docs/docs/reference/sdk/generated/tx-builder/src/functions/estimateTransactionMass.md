[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / estimateTransactionMass

# Function: estimateTransactionMass()

> **estimateTransactionMass**(`input`): [`MassEstimateResult`](../interfaces/MassEstimateResult.md)

Defined in: [packages/tx-builder/src/mass.ts:313](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/mass.ts#L313)

Mass of a transaction known only by its shape (input count, outputs,
payload). Computed by the SDK; amounts are unknown, so storage mass is not
included. The breakdown is derived by differencing SDK totals.

## Parameters

### input

[`ConsensusMassInput`](../interfaces/ConsensusMassInput.md)

## Returns

[`MassEstimateResult`](../interfaces/MassEstimateResult.md)
