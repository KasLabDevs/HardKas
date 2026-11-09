[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / declaredNodeEndpoint

# Function: declaredNodeEndpoint()

> **declaredNodeEndpoint**(`config`, `networkId`): `string`

Defined in: [packages/config/src/endpoint.ts:32](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/endpoint.ts#L32)

The endpoint declared for a network, if any: a non-empty `rpcUrl`. The built-in entries of the public networks carry
none (`rpcUrl: ""`, defaults.ts, D-TPC-2), so a public endpoint exists only where the user wrote one — the same URL
a built-in once held included — and no copy, clone or reload of a config can produce one the user did not write.
Local built-ins (simnet, devnet) keep theirs.

## Parameters

### config

[`HardkasConfig`](../interfaces/HardkasConfig.md)

### networkId

`string`

## Returns

`string`
