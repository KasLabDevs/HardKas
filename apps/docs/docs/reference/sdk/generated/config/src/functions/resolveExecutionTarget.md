[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / resolveExecutionTarget

# ~~Function: resolveExecutionTarget()~~

> **resolveExecutionTarget**(`options`): `object`

Defined in: [packages/config/src/resolve.ts:17](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/resolve.ts#L17)

## Parameters

### options

[`ResolveExecutionTargetOptions`](../interfaces/ResolveExecutionTargetOptions.md)

## Returns

`object`

### ~~execution~~

> **execution**: `object`

#### execution.domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"`

#### execution.mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"`

#### execution.network

> **network**: `string`

### ~~name~~

> **name**: [`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

### ~~target~~

> **target**: [`HardkasNetworkTarget`](../type-aliases/HardkasNetworkTarget.md)

## Deprecated

Use `resolveNewIntentTarget`, `resolveArtifactTarget`, or `resolveLegacyArtifactTarget` explicitly.
