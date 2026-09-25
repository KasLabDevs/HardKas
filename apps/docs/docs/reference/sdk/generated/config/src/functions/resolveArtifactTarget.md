[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / resolveArtifactTarget

# Function: resolveArtifactTarget()

> **resolveArtifactTarget**(`options`): `object`

Defined in: [packages/config/src/resolve.ts:140](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/config/src/resolve.ts#L140)

## Parameters

### options

#### artifact

[`ExecutionAwareArtifactConfig`](../interfaces/ExecutionAwareArtifactConfig.md)

## Returns

`object`

### source

> **source**: `"recorded"`

### target

> **target**: `object`

#### target.domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"`

#### target.mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"`

#### target.network

> **network**: `string`
