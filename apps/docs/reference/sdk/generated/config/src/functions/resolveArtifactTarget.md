[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / resolveArtifactTarget

# Function: resolveArtifactTarget()

> **resolveArtifactTarget**(`options`): `object`

Defined in: [packages/config/src/resolve.ts:141](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/resolve.ts#L141)

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
