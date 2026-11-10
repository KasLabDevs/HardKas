[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasReplay

# Class: HardkasReplay

Defined in: [packages/sdk/src/replay.ts:50](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/replay.ts#L50)

## Constructors

### Constructor

> **new HardkasReplay**(`sdk`): `HardkasReplay`

Defined in: [packages/sdk/src/replay.ts:51](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/replay.ts#L51)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasReplay`

## Methods

### verify()

> **verify**(`targetOrOptions?`, `options?`): `Promise`\<`ReplayVerifyResult`\>

Defined in: [packages/sdk/src/replay.ts:57](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/replay.ts#L57)

Verifies the deterministic artifact lineage of a transaction replay
against the mathematically reconstructed localnet state.

#### Parameters

##### targetOrOptions?

`string` \| \{ `artifactId?`: `string`; `schema?`: `string`; \} \| `ReplayVerifyOptions`

##### options?

`ReplayVerifyOptions`

#### Returns

`Promise`\<`ReplayVerifyResult`\>
