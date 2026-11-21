[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / resolveExecutionTarget

# ~~Function: resolveExecutionTarget()~~

> **resolveExecutionTarget**(`options`): `object`

Defined in: [packages/config/src/resolve.ts:17](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/resolve.ts#L17)

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
