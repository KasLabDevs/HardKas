[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / resolveNewIntentTarget

# Function: resolveNewIntentTarget()

> **resolveNewIntentTarget**(`options`): `object`

Defined in: [packages/config/src/resolve.ts:91](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/config/src/resolve.ts#L91)

## Parameters

### options

#### config

[`HardkasConfig`](../interfaces/HardkasConfig.md)

#### explicitTarget?

\{ `domain`: `"kaspa-l1"` \| `"evm-l2"`; `mode`: `"rpc"` \| `"simulator"` \| `"localnet"`; `network`: `string`; \}

#### explicitTarget.domain

`"kaspa-l1"` \| `"evm-l2"`

#### explicitTarget.mode

`"rpc"` \| `"simulator"` \| `"localnet"`

#### explicitTarget.network

`string`

## Returns

`object`

### domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"`

### mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"`

### network

> **network**: `string`
