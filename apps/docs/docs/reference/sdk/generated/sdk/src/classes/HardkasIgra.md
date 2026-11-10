[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasIgra

# Class: HardkasIgra

Defined in: [packages/sdk/src/igra.ts:13](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/igra.ts#L13)

## Constructors

### Constructor

> **new HardkasIgra**(`sdk`): `HardkasIgra`

Defined in: [packages/sdk/src/igra.ts:14](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/igra.ts#L14)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasIgra`

## Methods

### probe()

> **probe**(`igraRpcUrl?`): `Promise`\<`IgraStatusResult`\>

Defined in: [packages/sdk/src/igra.ts:20](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/igra.ts#L20)

Probes the given RPC URL for Igra capabilities.
Igra is treated as a separate L2 endpoint.

#### Parameters

##### igraRpcUrl?

`string`

#### Returns

`Promise`\<`IgraStatusResult`\>
