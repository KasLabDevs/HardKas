[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / estimateTransactionMass

# Function: estimateTransactionMass()

> **estimateTransactionMass**(`input`): [`MassEstimateResult`](../interfaces/MassEstimateResult.md)

Defined in: [packages/tx-builder/src/mass.ts:277](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/tx-builder/src/mass.ts#L277)

Mass of a transaction known only by its shape (input count, outputs,
payload). Computed by the SDK; amounts are unknown, so storage mass is not
included. The breakdown is derived by differencing SDK totals.

## Parameters

### input

[`ConsensusMassInput`](../interfaces/ConsensusMassInput.md)

## Returns

[`MassEstimateResult`](../interfaces/MassEstimateResult.md)
