[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / proposeComputeBudget

# Function: proposeComputeBudget()

> **proposeComputeBudget**(`input`): [`V1CertifiedBudget`](../interfaces/V1CertifiedBudget.md)

Defined in: [packages/tx-builder/src/v1-budgets.ts:67](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/tx-builder/src/v1-budgets.ts#L67)

The certified budget for an input, if one exists (undefined: the plan states its budget explicitly).

## Parameters

### input

#### entry?

`string`

#### kind

`"p2pk"` \| `"p2sh"` \| `"covenant"`

#### templateHash?

`string`

## Returns

[`V1CertifiedBudget`](../interfaces/V1CertifiedBudget.md)
