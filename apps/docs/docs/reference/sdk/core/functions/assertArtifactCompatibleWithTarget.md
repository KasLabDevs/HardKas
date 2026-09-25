[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / assertArtifactCompatibleWithTarget

# Function: assertArtifactCompatibleWithTarget()

> **assertArtifactCompatibleWithTarget**(`artifact`, `target`, `operation?`): `void`

Defined in: [packages/core/src/semantics/execution-guard.ts:137](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/execution-guard.ts#L137)

## Parameters

### artifact

[`ExecutionAwareArtifact`](../interfaces/ExecutionAwareArtifact.md)

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
