[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / resolveLegacyArtifactTarget

# Function: resolveLegacyArtifactTarget()

> **resolveLegacyArtifactTarget**(`options`): `object`

Defined in: [packages/config/src/resolve.ts:151](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/resolve.ts#L151)

## Parameters

### options

#### artifact

[`ExecutionAwareArtifactConfig`](../interfaces/ExecutionAwareArtifactConfig.md)

#### config

[`HardkasConfig`](../interfaces/HardkasConfig.md)

## Returns

`object`

### source

> **source**: `"legacy-inferred"`

### target

> **target**: `object`

#### target.domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"`

#### target.mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"`

#### target.network

> **network**: `string`
