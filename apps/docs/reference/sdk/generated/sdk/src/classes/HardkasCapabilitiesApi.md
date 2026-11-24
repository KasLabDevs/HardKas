[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasCapabilitiesApi

# Class: HardkasCapabilitiesApi

Defined in: [packages/sdk/src/capabilities.ts:370](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L370)

## Constructors

### Constructor

> **new HardkasCapabilitiesApi**(`sdk?`, `readinessOptions?`): `HardkasCapabilitiesApi`

Defined in: [packages/sdk/src/capabilities.ts:378](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L378)

`readiness`: which node the Silver readiness checks (INT9-C5; default the canonical localnet). `hardkas
capabilities` passes the node the Silver on-chain commands would use (`--url`, or the workspace's endpoint).

#### Parameters

##### sdk?

`any`

##### readinessOptions?

[`SilverReadinessOptions`](../interfaces/SilverReadinessOptions.md) = `{}`

#### Returns

`HardkasCapabilitiesApi`

## Methods

### get()

> **get**(): `Promise`\<[`HardkasCapabilities`](../interfaces/HardkasCapabilities.md)\>

Defined in: [packages/sdk/src/capabilities.ts:380](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L380)

#### Returns

`Promise`\<[`HardkasCapabilities`](../interfaces/HardkasCapabilities.md)\>

***

### probeEnvironment()

> **probeEnvironment**(`options?`): `Promise`\<`EnvironmentCapabilities`\>

Defined in: [packages/sdk/src/capabilities.ts:432](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L432)

#### Parameters

##### options?

`ProbeOptions`

#### Returns

`Promise`\<`EnvironmentCapabilities`\>

***

### probeWasm()

> **probeWasm**(`options?`): `Promise`\<\{ `computeBudget`: `boolean`; `covenantOutputs`: `boolean`; `rpc`: `boolean`; `signingV1`: `boolean`; `storageMass`: `boolean`; `v1`: `boolean`; `version?`: `string`; `wasm`: `boolean`; \}\>

Defined in: [packages/sdk/src/capabilities.ts:427](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L427)

#### Parameters

##### options?

`ProbeOptions`

#### Returns

`Promise`\<\{ `computeBudget`: `boolean`; `covenantOutputs`: `boolean`; `rpc`: `boolean`; `signingV1`: `boolean`; `storageMass`: `boolean`; `v1`: `boolean`; `version?`: `string`; `wasm`: `boolean`; \}\>

***

### silverReadiness()

> **silverReadiness**(`options?`): `Promise`\<[`SilverReadiness`](../interfaces/SilverReadiness.md)\>

Defined in: [packages/sdk/src/capabilities.ts:422](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/capabilities.ts#L422)

The checks behind `silverScript`, `covenants` and the node matrix, cached like the environment probe.

#### Parameters

##### options?

###### refresh?

`boolean`

#### Returns

`Promise`\<[`SilverReadiness`](../interfaces/SilverReadiness.md)\>
