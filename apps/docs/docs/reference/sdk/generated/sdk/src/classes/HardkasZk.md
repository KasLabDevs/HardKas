[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasZk

# Class: HardkasZk

Defined in: [packages/sdk/src/zk.ts:108](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L108)

## Constructors

### Constructor

> **new HardkasZk**(`sdk`): `HardkasZk`

Defined in: [packages/sdk/src/zk.ts:117](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L117)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasZk`

## Properties

### corpus

> `readonly` **corpus**: `object`

Defined in: [packages/sdk/src/zk.ts:113](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L113)

#### verify

> **verify**: (`targetPath`) => `Promise`\<[`ZkCorpusVerifyResult`](../interfaces/ZkCorpusVerifyResult.md)\>

##### Parameters

###### targetPath

`string`

##### Returns

`Promise`\<[`ZkCorpusVerifyResult`](../interfaces/ZkCorpusVerifyResult.md)\>

***

### proof

> `readonly` **proof**: `object`

Defined in: [packages/sdk/src/zk.ts:109](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L109)

#### inspect

> **inspect**: (`targetPath`) => `Promise`\<[`ZkProofInspectResult`](../interfaces/ZkProofInspectResult.md)\>

##### Parameters

###### targetPath

`string`

##### Returns

`Promise`\<[`ZkProofInspectResult`](../interfaces/ZkProofInspectResult.md)\>

#### verifyLocal

> **verifyLocal**: (`targetPath`) => `Promise`\<[`ZkProofVerifyResult`](../interfaces/ZkProofVerifyResult.md)\>

##### Parameters

###### targetPath

`string`

##### Returns

`Promise`\<[`ZkProofVerifyResult`](../interfaces/ZkProofVerifyResult.md)\>

## Methods

### capabilities()

> **capabilities**(): `Promise`\<[`ZkCapabilities`](../interfaces/ZkCapabilities.md)\>

Defined in: [packages/sdk/src/zk.ts:127](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/zk.ts#L127)

#### Returns

`Promise`\<[`ZkCapabilities`](../interfaces/ZkCapabilities.md)\>
