[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / resolveNodeEndpoint

# Function: resolveNodeEndpoint()

> **resolveNodeEndpoint**(`options`): [`ResolvedNodeEndpoint`](../interfaces/ResolvedNodeEndpoint.md)

Defined in: [packages/config/src/endpoint.ts:65](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/endpoint.ts#L65)

The node endpoint for a network, by the rules above; throws NETWORK_ENDPOINT_REQUIRED instead of guessing.

## Parameters

### options

#### config

[`HardkasConfig`](../interfaces/HardkasConfig.md)

#### explicitUrl?

`string`

#### networkId

`string`

## Returns

[`ResolvedNodeEndpoint`](../interfaces/ResolvedNodeEndpoint.md)
