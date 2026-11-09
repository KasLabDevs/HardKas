[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / resolveLegacyArtifactTarget

# Function: resolveLegacyArtifactTarget()

> **resolveLegacyArtifactTarget**(`options`): `object`

Defined in: [packages/config/src/resolve.ts:151](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/resolve.ts#L151)

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
