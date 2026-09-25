[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasReplay

# Class: HardkasReplay

Defined in: [packages/sdk/src/replay.ts:44](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/replay.ts#L44)

## Constructors

### Constructor

> **new HardkasReplay**(`sdk`): `HardkasReplay`

Defined in: [packages/sdk/src/replay.ts:45](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/replay.ts#L45)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasReplay`

## Methods

### verify()

> **verify**(`targetOrOptions?`, `options?`): `Promise`\<`ReplayVerifyResult`\>

Defined in: [packages/sdk/src/replay.ts:51](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/replay.ts#L51)

Verifies the deterministic artifact lineage of a transaction replay
against the mathematically reconstructed localnet state.

#### Parameters

##### targetOrOptions?

`string` \| \{ `artifactId?`: `string`; `schema?`: `string`; \} \| `ReplayVerifyOptions`

##### options?

`ReplayVerifyOptions`

#### Returns

`Promise`\<`ReplayVerifyResult`\>
