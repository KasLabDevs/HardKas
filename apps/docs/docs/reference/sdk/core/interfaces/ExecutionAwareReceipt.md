[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / ExecutionAwareReceipt

# Interface: ExecutionAwareReceipt

Defined in: [packages/core/src/semantics/execution-guard.ts:23](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/execution-guard.ts#L23)

## Properties

### execution?

> `optional` **execution?**: `object`

Defined in: [packages/core/src/semantics/execution-guard.ts:24](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/execution-guard.ts#L24)

#### domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"` = `executionDomainSchema`

#### mode

> **mode**: `"rpc"` \| `"localnet"` \| `"simulator"` = `executionModeSchema`

#### network

> **network**: `string`
