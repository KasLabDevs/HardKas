[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / estimateV1ComputeBudget

# Function: estimateV1ComputeBudget()

> **estimateV1ComputeBudget**(`input`): [`V1BudgetEstimate`](../interfaces/V1BudgetEstimate.md)

Defined in: [packages/tx-builder/src/v1-budgets.ts:169](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-budgets.ts#L169)

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
