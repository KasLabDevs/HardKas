[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasCapabilitiesApi

# Class: HardkasCapabilitiesApi

Defined in: [packages/sdk/src/capabilities.ts:258](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/capabilities.ts#L258)

## Constructors

### Constructor

> **new HardkasCapabilitiesApi**(`sdk?`): `HardkasCapabilitiesApi`

Defined in: [packages/sdk/src/capabilities.ts:262](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/capabilities.ts#L262)

#### Parameters

##### sdk?

`any`

#### Returns

`HardkasCapabilitiesApi`

## Methods

### get()

> **get**(): `Promise`\<[`HardkasCapabilities`](../interfaces/HardkasCapabilities.md)\>

Defined in: [packages/sdk/src/capabilities.ts:264](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/capabilities.ts#L264)

#### Returns

`Promise`\<[`HardkasCapabilities`](../interfaces/HardkasCapabilities.md)\>

***

### probeEnvironment()

> **probeEnvironment**(`options?`): `Promise`\<`EnvironmentCapabilities`\>

Defined in: [packages/sdk/src/capabilities.ts:316](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/capabilities.ts#L316)

#### Parameters

##### options?

`ProbeOptions`

#### Returns

`Promise`\<`EnvironmentCapabilities`\>

***

### probeWasm()

> **probeWasm**(`options?`): `Promise`\<\{ `computeBudget`: `boolean`; `covenantOutputs`: `boolean`; `rpc`: `boolean`; `signingV1`: `boolean`; `storageMass`: `boolean`; `v1`: `boolean`; `version?`: `string`; `wasm`: `boolean`; \}\>

Defined in: [packages/sdk/src/capabilities.ts:311](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/capabilities.ts#L311)

#### Parameters

##### options?

`ProbeOptions`

#### Returns

`Promise`\<\{ `computeBudget`: `boolean`; `covenantOutputs`: `boolean`; `rpc`: `boolean`; `signingV1`: `boolean`; `storageMass`: `boolean`; `v1`: `boolean`; `version?`: `string`; `wasm`: `boolean`; \}\>

***

### silverReadiness()

> **silverReadiness**(`options?`): `Promise`\<[`SilverReadiness`](../interfaces/SilverReadiness.md)\>

Defined in: [packages/sdk/src/capabilities.ts:306](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/capabilities.ts#L306)

The checks behind `silverScript`, `covenants` and the node matrix, cached like the environment probe.

#### Parameters

##### options?

###### refresh?

`boolean`

#### Returns

`Promise`\<[`SilverReadiness`](../interfaces/SilverReadiness.md)\>
