[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / SignedTxArtifactV2

# Interface: SignedTxArtifactV2

Defined in: [packages/artifacts/src/types.ts:304](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L304)

## Extends

- [`BaseArtifact`](BaseArtifact.md)\<`"signedTx.v2"`\>

## Properties

### amountSompi

> **amountSompi**: `string`

Defined in: [packages/artifacts/src/types.ts:318](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L318)

***

### assumptionLevel?

> `optional` **assumptionLevel?**: [`AssumptionLevel`](../type-aliases/AssumptionLevel.md)

Defined in: [packages/artifacts/src/types.ts:44](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L44)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`assumptionLevel`](BaseArtifact.md#assumptionlevel)

***

### assumptionRef?

> `optional` **assumptionRef?**: `string`

Defined in: [packages/artifacts/src/types.ts:346](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L346)

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

### from

> **from**: `object`

Defined in: [packages/artifacts/src/types.ts:308](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L308)

#### accountName?

> `optional` **accountName?**: `string`

#### address

> **address**: [`KaspaAddress`](../../../sdk/src/type-aliases/KaspaAddress.md)

#### input?

> `optional` **input?**: `string`

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

### metadata?

> `optional` **metadata?**: `any`

Defined in: [packages/artifacts/src/types.ts:347](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L347)

***

### mode

> **mode**: [`AnyExecutionMode`](../type-aliases/AnyExecutionMode.md)

Defined in: [packages/artifacts/src/types.ts:39](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L39)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`mode`](BaseArtifact.md#mode)

***

### multisig?

> `optional` **multisig?**: `object`

Defined in: [packages/artifacts/src/types.ts:327](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L327)

#### requiredSigners

> **requiredSigners**: `string`[]

#### signatures

> **signatures**: `object`[]

#### threshold

> **threshold**: `number`

***

### networkId

> **networkId**: [`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

Defined in: [packages/artifacts/src/types.ts:38](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L38)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`networkId`](BaseArtifact.md#networkid)

***

### networkProfileRef?

> `optional` **networkProfileRef?**: `string`

Defined in: [packages/artifacts/src/types.ts:343](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L343)

***

### policyRef?

> `optional` **policyRef?**: `string`

Defined in: [packages/artifacts/src/types.ts:344](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L344)

***

### policyRefs?

> `optional` **policyRefs?**: `string`[]

Defined in: [packages/artifacts/src/types.ts:345](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L345)

***

### schema

> **schema**: `"hardkas.signedTx.v2"`

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

### signatureMetadata?

> `optional` **signatureMetadata?**: `object`[]

Defined in: [packages/artifacts/src/types.ts:337](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L337)

#### signedAt

> **signedAt**: `string`

#### signer

> **signer**: `string`

***

### signedId

> **signedId**: [`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

Defined in: [packages/artifacts/src/types.ts:306](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L306)

***

### signedTransaction?

> `optional` **signedTransaction?**: `object`

Defined in: [packages/artifacts/src/types.ts:320](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L320)

#### format

> **format**: `string`

#### payload

> **payload**: `string`

***

### sourcePlanId

> **sourcePlanId**: `string`

Defined in: [packages/artifacts/src/types.ts:307](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L307)

***

### status

> **status**: `"signed"` \| `"partially_signed"`

Defined in: [packages/artifacts/src/types.ts:305](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L305)

***

### to

> **to**: `object`

Defined in: [packages/artifacts/src/types.ts:313](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L313)

#### accountName?

> `optional` **accountName?**: `string`

#### address

> **address**: [`KaspaAddress`](../../../sdk/src/type-aliases/KaspaAddress.md)

#### input?

> `optional` **input?**: `string`

***

### txId?

> `optional` **txId?**: [`TxId`](../../../sdk/src/type-aliases/TxId.md)

Defined in: [packages/artifacts/src/types.ts:326](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L326)

***

### unsignedPayloadHash?

> `optional` **unsignedPayloadHash?**: `string`

Defined in: [packages/artifacts/src/types.ts:319](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L319)

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
