[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / TxPlanArtifactV1

# Interface: TxPlanArtifactV1

Defined in: [packages/artifacts/src/types.ts:93](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L93)

## Extends

- [`HardkasArtifactBase`](HardkasArtifactBase.md)

## Properties

### amount

> `readonly` **amount**: `string`

Defined in: [packages/artifacts/src/types.ts:111](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L111)

***

### amountSompi

> `readonly` **amountSompi**: `string`

Defined in: [packages/artifacts/src/types.ts:110](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L110)

***

### change?

> `readonly` `optional` **change?**: [`TxOutputArtifact`](TxOutputArtifact.md)

Defined in: [packages/artifacts/src/types.ts:115](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L115)

***

### createdAt

> **createdAt**: `string`

Defined in: [packages/artifacts/src/types.ts:29](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L29)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`createdAt`](HardkasArtifactBase.md#createdat)

***

### estimatedFee

> `readonly` **estimatedFee**: `string`

Defined in: [packages/artifacts/src/types.ts:119](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L119)

***

### estimatedFeeSompi

> `readonly` **estimatedFeeSompi**: `string`

Defined in: [packages/artifacts/src/types.ts:118](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L118)

***

### estimatedMass

> `readonly` **estimatedMass**: `string`

Defined in: [packages/artifacts/src/types.ts:117](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L117)

***

### from

> `readonly` **from**: `object`

Defined in: [packages/artifacts/src/types.ts:99](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L99)

#### accountName?

> `readonly` `optional` **accountName?**: `string`

#### address

> `readonly` **address**: `string`

#### input

> `readonly` **input**: `string`

***

### hardkasVersion

> **hardkasVersion**: `string`

Defined in: [packages/artifacts/src/types.ts:24](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L24)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`hardkasVersion`](HardkasArtifactBase.md#hardkasversion)

***

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

Defined in: [packages/artifacts/src/types.ts:26](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L26)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`hashVersion`](HardkasArtifactBase.md#hashversion)

***

### metadata?

> `readonly` `optional` **metadata?**: `Record`\<`string`, `any`\>

Defined in: [packages/artifacts/src/types.ts:122](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L122)

***

### mode

> **mode**: [`AnyExecutionMode`](../type-aliases/AnyExecutionMode.md)

Defined in: [packages/artifacts/src/types.ts:28](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L28)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`mode`](HardkasArtifactBase.md#mode)

***

### networkId

> **networkId**: [`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

Defined in: [packages/artifacts/src/types.ts:27](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L27)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`networkId`](HardkasArtifactBase.md#networkid)

***

### outputs

> `readonly` **outputs**: readonly [`TxOutputArtifact`](TxOutputArtifact.md)[]

Defined in: [packages/artifacts/src/types.ts:114](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L114)

***

### planId

> `readonly` **planId**: `string`

Defined in: [packages/artifacts/src/types.ts:97](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L97)

***

### rpcUrl?

> `readonly` `optional` **rpcUrl?**: `string`

Defined in: [packages/artifacts/src/types.ts:121](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L121)

***

### schema

> `readonly` **schema**: `"hardkas.txPlan.v1"`

Defined in: [packages/artifacts/src/types.ts:94](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L94)

#### Overrides

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`schema`](HardkasArtifactBase.md#schema)

***

### schemaVersion?

> `optional` **schemaVersion?**: `string`

Defined in: [packages/artifacts/src/types.ts:23](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L23)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`schemaVersion`](HardkasArtifactBase.md#schemaversion)

***

### selectedUtxos

> `readonly` **selectedUtxos**: readonly [`UtxoArtifact`](UtxoArtifact.md)[]

Defined in: [packages/artifacts/src/types.ts:113](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L113)

***

### status

> `readonly` **status**: `"built"` \| `"unsigned"`

Defined in: [packages/artifacts/src/types.ts:95](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L95)

***

### to

> `readonly` **to**: `object`

Defined in: [packages/artifacts/src/types.ts:105](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L105)

#### address

> `readonly` **address**: `string`

#### input

> `readonly` **input**: `string`

***

### version

> **version**: `string`

Defined in: [packages/artifacts/src/types.ts:25](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L25)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`version`](HardkasArtifactBase.md#version)
