[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / resolveLegacyArtifactTarget

# Function: resolveLegacyArtifactTarget()

> **resolveLegacyArtifactTarget**(`options`): `object`

Defined in: [packages/config/src/resolve.ts:150](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/config/src/resolve.ts#L150)

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
