[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasReplay

# Class: HardkasReplay

Defined in: [packages/sdk/src/replay.ts:55](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/replay.ts#L55)

## Constructors

### Constructor

> **new HardkasReplay**(`sdk`): `HardkasReplay`

Defined in: [packages/sdk/src/replay.ts:56](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/replay.ts#L56)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasReplay`

## Methods

### verify()

> **verify**(`targetOrOptions?`, `options?`): `Promise`\<`ReplayVerifyResult`\>

Defined in: [packages/sdk/src/replay.ts:62](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/replay.ts#L62)

Verifies the deterministic artifact lineage of a transaction replay
against the mathematically reconstructed localnet state.

#### Parameters

##### targetOrOptions?

`string` \| \{ `artifactId?`: `string`; `schema?`: `string`; \} \| `ReplayVerifyOptions`

##### options?

`ReplayVerifyOptions`

#### Returns

`Promise`\<`ReplayVerifyResult`\>
