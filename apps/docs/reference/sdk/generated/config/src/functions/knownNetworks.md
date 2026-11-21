[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [config/src](../README.md) / knownNetworks

# Function: knownNetworks()

> **knownNetworks**(`config`): `Record`\<`string`, [`HardkasNetworkTarget`](../type-aliases/HardkasNetworkTarget.md)\>

Defined in: [packages/config/src/resolve.ts:207](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/config/src/resolve.ts#L207)

The networks a config knows: the built-ins, then its own (a config may redefine a built-in).

## Parameters

### config

[`HardkasConfig`](../interfaces/HardkasConfig.md)

## Returns

`Record`\<`string`, [`HardkasNetworkTarget`](../type-aliases/HardkasNetworkTarget.md)\>
