[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / estimateV1ComputeBudget

# Function: estimateV1ComputeBudget()

> **estimateV1ComputeBudget**(`input`): [`V1BudgetEstimate`](../interfaces/V1BudgetEstimate.md)

Defined in: [packages/tx-builder/src/v1-budgets.ts:155](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-budgets.ts#L155)

The upstream estimate of an input's script units and the smallest budget covering it. `signatureScriptHex` is the
input's final signature script (signatures have a fixed size: placeholders give the exact one); `scriptPublicKeyHex`
the output it spends, version-prefixed ("0000…") as HardKAS plans carry it.

## Parameters

### input

#### scriptPublicKeyHex

`string`

#### signatureScriptHex

`string`

## Returns

[`V1BudgetEstimate`](../interfaces/V1BudgetEstimate.md)
