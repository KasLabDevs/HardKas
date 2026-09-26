[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / ExecutionAwareArtifact

# Interface: ExecutionAwareArtifact

Defined in: [packages/core/src/semantics/execution-guard.ts:19](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/execution-guard.ts#L19)

## Properties

### execution?

> `optional` **execution?**: `object`

Defined in: [packages/core/src/semantics/execution-guard.ts:20](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/execution-guard.ts#L20)

#### domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"` = `executionDomainSchema`

#### mode

> **mode**: `"rpc"` \| `"localnet"` \| `"simulator"` = `executionModeSchema`

#### network

> **network**: `string`
