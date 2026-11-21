[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / resolveNodeEndpoint

# Function: resolveNodeEndpoint()

> **resolveNodeEndpoint**(`options`): [`ResolvedNodeEndpoint`](../interfaces/ResolvedNodeEndpoint.md)

Defined in: [packages/config/src/endpoint.ts:71](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/endpoint.ts#L71)

The node endpoint for a network, by the rules above; throws NETWORK_ENDPOINT_REQUIRED instead of guessing.
MAINNET TOTAL LOCKDOWN: first of all, a network of the mainnet type — the name asked for or the network its config
entry declares (an alias such as "prod" declaring `network: "mainnet"`, `kaspa`, `mainnet-1`, `kaspa-mainnet`) — gets
NO endpoint: MAINNET_CONNECTION_DISABLED, before an explicit `--url`, a declared `rpcUrl` or a default is even read.
Every client path that asks this authority for a node (CLI and SDK) is refused here, before any connection.

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
