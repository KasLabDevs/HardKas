[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / knownNetworks

# Function: knownNetworks()

> **knownNetworks**(`config`): `Record`\<`string`, [`HardkasNetworkTarget`](../type-aliases/HardkasNetworkTarget.md)\>

Defined in: [packages/config/src/resolve.ts:207](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/config/src/resolve.ts#L207)

The networks a config knows: the built-ins, then its own (a config may redefine a built-in).

## Parameters

### config

[`HardkasConfig`](../interfaces/HardkasConfig.md)

## Returns

`Record`\<`string`, [`HardkasNetworkTarget`](../type-aliases/HardkasNetworkTarget.md)\>
