[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / TxTraceArtifact

# Interface: TxTraceArtifact

Defined in: packages/artifacts/dist/index.d.ts:8847

## Extends

- `BaseArtifact`\<`"txTrace"`\>

## Properties

### assumptionLevel?

> `optional` **assumptionLevel?**: `AssumptionLevel`

Defined in: packages/artifacts/dist/index.d.ts:8454

#### Inherited from

`BaseArtifact.assumptionLevel`

***

### contentHash?

> `optional` **contentHash?**: `ContentHash`

Defined in: packages/artifacts/dist/index.d.ts:8452

#### Inherited from

`BaseArtifact.contentHash`

***

### createdAt

> **createdAt**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8451

#### Inherited from

`BaseArtifact.createdAt`

***

### dagContext?

> `optional` **dagContext?**: `DagContext`

Defined in: packages/artifacts/dist/index.d.ts:8855

***

### execution?

> `optional` **execution?**: `object`

Defined in: packages/artifacts/dist/index.d.ts:8456

#### domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"`

#### mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"`

#### network

> **network**: `string`

#### Inherited from

`BaseArtifact.execution`

***

### executionMode?

> `optional` **executionMode?**: `AnyExecutionMode`

Defined in: packages/artifacts/dist/index.d.ts:8455

#### Inherited from

`BaseArtifact.executionMode`

***

### hardkasVersion

> **hardkasVersion**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8446

#### Inherited from

`BaseArtifact.hardkasVersion`

***

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

Defined in: packages/artifacts/dist/index.d.ts:8448

#### Inherited from

`BaseArtifact.hashVersion`

***

### lineage?

> `optional` **lineage?**: `object`

Defined in: packages/artifacts/dist/index.d.ts:8457

#### artifactId

> **artifactId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

#### lineageId

> **lineageId**: [`LineageId`](../type-aliases/LineageId.md)

#### parentArtifactId?

> `optional` **parentArtifactId?**: [`ArtifactId`](../type-aliases/ArtifactId.md)

#### rootArtifactId

> **rootArtifactId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

#### sequence?

> `optional` **sequence?**: `number` \| `EventSequence`

#### Inherited from

`BaseArtifact.lineage`

***

### mode

> **mode**: `AnyExecutionMode`

Defined in: packages/artifacts/dist/index.d.ts:8450

#### Inherited from

`BaseArtifact.mode`

***

### networkId

> **networkId**: [`NetworkId`](../type-aliases/NetworkId.md)

Defined in: packages/artifacts/dist/index.d.ts:8449

#### Inherited from

`BaseArtifact.networkId`

***

### schema

> **schema**: `"hardkas.txTrace"`

Defined in: packages/artifacts/dist/index.d.ts:8444

#### Inherited from

`BaseArtifact.schema`

***

### schemaVersion?

> `optional` **schemaVersion?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8445

#### Inherited from

`BaseArtifact.schemaVersion`

***

### steps

> **steps**: `object`[]

Defined in: packages/artifacts/dist/index.d.ts:8849

#### details?

> `optional` **details?**: `any`

#### phase

> **phase**: `string`

#### status

> **status**: `string`

#### timestamp

> **timestamp**: `string`

***

### txId

> **txId**: [`TxId`](../type-aliases/TxId.md)

Defined in: packages/artifacts/dist/index.d.ts:8848

***

### version

> **version**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8447

#### Inherited from

`BaseArtifact.version`

***

### workflowId?

> `optional` **workflowId?**: `WorkflowId`

Defined in: packages/artifacts/dist/index.d.ts:8453

#### Inherited from

`BaseArtifact.workflowId`
