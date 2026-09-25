[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / ExecutionCompatibilityInput

# Interface: ExecutionCompatibilityInput

Defined in: [packages/core/src/semantics/execution-guard.ts:29](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/execution-guard.ts#L29)

## Properties

### account?

> `optional` **account?**: [`ExecutionAwareAccount`](ExecutionAwareAccount.md)

Defined in: [packages/core/src/semantics/execution-guard.ts:31](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/execution-guard.ts#L31)

***

### artifact?

> `optional` **artifact?**: [`ExecutionAwareArtifact`](ExecutionAwareArtifact.md)

Defined in: [packages/core/src/semantics/execution-guard.ts:32](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/execution-guard.ts#L32)

***

### operation

> **operation**: [`ExecutionOperation`](../type-aliases/ExecutionOperation.md)

Defined in: [packages/core/src/semantics/execution-guard.ts:34](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/execution-guard.ts#L34)

***

### receipt?

> `optional` **receipt?**: [`ExecutionAwareReceipt`](ExecutionAwareReceipt.md)

Defined in: [packages/core/src/semantics/execution-guard.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/execution-guard.ts#L33)

***

### target

> **target**: `object`

Defined in: [packages/core/src/semantics/execution-guard.ts:30](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/semantics/execution-guard.ts#L30)

#### domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"` = `executionDomainSchema`

#### mode

> **mode**: `"rpc"` \| `"localnet"` \| `"simulator"` = `executionModeSchema`

#### network

> **network**: `string`
