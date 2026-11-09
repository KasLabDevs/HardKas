[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / proposeComputeBudget

# Function: proposeComputeBudget()

> **proposeComputeBudget**(`input`): [`V1CertifiedBudget`](../interfaces/V1CertifiedBudget.md)

Defined in: [packages/tx-builder/src/v1-budgets.ts:67](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-budgets.ts#L67)

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
