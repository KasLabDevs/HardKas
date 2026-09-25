[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasCapabilitiesApi

# Class: HardkasCapabilitiesApi

Defined in: [packages/sdk/src/capabilities.ts:109](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/capabilities.ts#L109)

## Constructors

### Constructor

> **new HardkasCapabilitiesApi**(`sdk?`): `HardkasCapabilitiesApi`

Defined in: [packages/sdk/src/capabilities.ts:112](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/capabilities.ts#L112)

#### Parameters

##### sdk?

`any`

#### Returns

`HardkasCapabilitiesApi`

## Methods

### get()

> **get**(): `Promise`\<[`HardkasCapabilities`](../interfaces/HardkasCapabilities.md)\>

Defined in: [packages/sdk/src/capabilities.ts:114](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/capabilities.ts#L114)

#### Returns

`Promise`\<[`HardkasCapabilities`](../interfaces/HardkasCapabilities.md)\>

***

### probeEnvironment()

> **probeEnvironment**(`options?`): `Promise`\<`EnvironmentCapabilities`\>

Defined in: [packages/sdk/src/capabilities.ts:150](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/capabilities.ts#L150)

#### Parameters

##### options?

`ProbeOptions`

#### Returns

`Promise`\<`EnvironmentCapabilities`\>

***

### probeWasm()

> **probeWasm**(`options?`): `Promise`\<\{ `computeBudget`: `boolean`; `covenantOutputs`: `boolean`; `rpc`: `boolean`; `signingV1`: `boolean`; `storageMass`: `boolean`; `v1`: `boolean`; `version?`: `string`; `wasm`: `boolean`; \}\>

Defined in: [packages/sdk/src/capabilities.ts:145](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/capabilities.ts#L145)

#### Parameters

##### options?

`ProbeOptions`

#### Returns

`Promise`\<\{ `computeBudget`: `boolean`; `covenantOutputs`: `boolean`; `rpc`: `boolean`; `signingV1`: `boolean`; `storageMass`: `boolean`; `v1`: `boolean`; `version?`: `string`; `wasm`: `boolean`; \}\>
