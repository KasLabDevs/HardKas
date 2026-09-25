[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / NetworkProfileArtifact

# Interface: NetworkProfileArtifact

Defined in: [packages/artifacts/src/types.ts:477](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L477)

## Extends

- [`BaseArtifact`](BaseArtifact.md)\<`"networkProfile.v1"`\>

## Properties

### assumptionLevel?

> `optional` **assumptionLevel?**: [`AssumptionLevel`](../type-aliases/AssumptionLevel.md)

Defined in: [packages/artifacts/src/types.ts:44](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L44)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`assumptionLevel`](BaseArtifact.md#assumptionlevel)

***

### capabilities

> **capabilities**: `Record`\<`string`, `any`\>

Defined in: [packages/artifacts/src/types.ts:480](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L480)

***

### contentHash?

> `optional` **contentHash?**: `ContentHash`

Defined in: [packages/artifacts/src/types.ts:42](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L42)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`contentHash`](BaseArtifact.md#contenthash)

***

### createdAt

> **createdAt**: `string`

Defined in: [packages/artifacts/src/types.ts:40](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L40)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`createdAt`](BaseArtifact.md#createdat)

***

### execution?

> `optional` **execution?**: `object`

Defined in: [packages/artifacts/src/types.ts:46](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L46)

#### domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"`

#### mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"`

#### network

> **network**: `string`

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`execution`](BaseArtifact.md#execution)

***

### executionMode?

> `optional` **executionMode?**: [`AnyExecutionMode`](../type-aliases/AnyExecutionMode.md)

Defined in: [packages/artifacts/src/types.ts:45](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L45)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`executionMode`](BaseArtifact.md#executionmode)

***

### hardkasVersion

> **hardkasVersion**: `string`

Defined in: [packages/artifacts/src/types.ts:35](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L35)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`hardkasVersion`](BaseArtifact.md#hardkasversion)

***

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

Defined in: [packages/artifacts/src/types.ts:37](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L37)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`hashVersion`](BaseArtifact.md#hashversion)

***

### layer

> **layer**: `string`

Defined in: [packages/artifacts/src/types.ts:479](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L479)

***

### lineage?

> `optional` **lineage?**: `object`

Defined in: [packages/artifacts/src/types.ts:48](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L48)

#### artifactId

> **artifactId**: [`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

#### lineageId

> **lineageId**: [`LineageId`](../../../sdk/src/type-aliases/LineageId.md)

#### parentArtifactId?

> `optional` **parentArtifactId?**: [`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

#### rootArtifactId

> **rootArtifactId**: [`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

#### sequence?

> `optional` **sequence?**: `number` \| `EventSequence`

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`lineage`](BaseArtifact.md#lineage)

***

### mode

> **mode**: [`AnyExecutionMode`](../type-aliases/AnyExecutionMode.md)

Defined in: [packages/artifacts/src/types.ts:39](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L39)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`mode`](BaseArtifact.md#mode)

***

### networkId

> **networkId**: [`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

Defined in: [packages/artifacts/src/types.ts:38](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L38)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`networkId`](BaseArtifact.md#networkid)

***

### networkProfileId

> **networkProfileId**: `string`

Defined in: [packages/artifacts/src/types.ts:478](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L478)

***

### schema

> **schema**: `"hardkas.networkProfile.v1"`

Defined in: [packages/artifacts/src/types.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L33)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`schema`](BaseArtifact.md#schema)

***

### schemaVersion?

> `optional` **schemaVersion?**: `string`

Defined in: [packages/artifacts/src/types.ts:34](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L34)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`schemaVersion`](BaseArtifact.md#schemaversion)

***

### version

> **version**: `string`

Defined in: [packages/artifacts/src/types.ts:36](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L36)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`version`](BaseArtifact.md#version)

***

### workflowId?

> `optional` **workflowId?**: `WorkflowId`

Defined in: [packages/artifacts/src/types.ts:43](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L43)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`workflowId`](BaseArtifact.md#workflowid)
