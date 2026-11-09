[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / resolveArtifactTarget

# Function: resolveArtifactTarget()

> **resolveArtifactTarget**(`options`): `object`

Defined in: [packages/config/src/resolve.ts:141](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/resolve.ts#L141)

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
