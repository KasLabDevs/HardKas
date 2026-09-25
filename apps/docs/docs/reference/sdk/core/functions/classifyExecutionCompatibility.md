[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / classifyExecutionCompatibility

# Function: classifyExecutionCompatibility()

> **classifyExecutionCompatibility**(`artifact`, `runtime`, `capability?`): [`ExecutionCompatibility`](../type-aliases/ExecutionCompatibility.md)

Defined in: [packages/core/src/semantics/compatibility.ts:22](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/compatibility.ts#L22)

## Parameters

### artifact

#### domain

`"kaspa-l1"` \| `"evm-l2"` = `executionDomainSchema`

#### mode

`"rpc"` \| `"localnet"` \| `"simulator"` = `executionModeSchema`

#### network

`string` = `...`

### runtime

#### domain

`"kaspa-l1"` \| `"evm-l2"` = `executionDomainSchema`

#### mode

`"rpc"` \| `"localnet"` \| `"simulator"` = `executionModeSchema`

#### network

`string` = `...`

### capability?

[`ExecutionOperation`](../type-aliases/ExecutionOperation.md)

## Returns

[`ExecutionCompatibility`](../type-aliases/ExecutionCompatibility.md)
