[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / assertReceiptCompatibleWithTarget

# Function: assertReceiptCompatibleWithTarget()

> **assertReceiptCompatibleWithTarget**(`receipt`, `target`, `operation?`): `void`

Defined in: [packages/core/src/semantics/execution-guard.ts:166](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/execution-guard.ts#L166)

## Parameters

### receipt

[`ExecutionAwareReceipt`](../interfaces/ExecutionAwareReceipt.md)

### target

#### domain

`"kaspa-l1"` \| `"evm-l2"` = `executionDomainSchema`

#### mode

`"rpc"` \| `"localnet"` \| `"simulator"` = `executionModeSchema`

#### network

`string` = `...`

### operation?

[`ExecutionOperation`](../type-aliases/ExecutionOperation.md)

## Returns

`void`
