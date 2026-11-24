[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / TxTraceArtifact

# Interface: TxTraceArtifact

Defined in: packages/artifacts/dist/index.d.ts:5158

## Extends

- `BaseArtifact`\<`"txTrace"`\>

## Properties

### assumptionLevel?

> `optional` **assumptionLevel?**: `AssumptionLevel`

Defined in: packages/artifacts/dist/index.d.ts:4733

#### Inherited from

`BaseArtifact.assumptionLevel`

***

### contentHash?

> `optional` **contentHash?**: `ContentHash`

Defined in: packages/artifacts/dist/index.d.ts:4731

#### Inherited from

`BaseArtifact.contentHash`

***

### createdAt

> **createdAt**: `string`

Defined in: packages/artifacts/dist/index.d.ts:4730

#### Inherited from

`BaseArtifact.createdAt`

***

### dagContext?

> `optional` **dagContext?**: `DagContext`

Defined in: packages/artifacts/dist/index.d.ts:5166

***

### execution?

> `optional` **execution?**: `object`

Defined in: packages/artifacts/dist/index.d.ts:4735

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

Defined in: packages/artifacts/dist/index.d.ts:4734

#### Inherited from

`BaseArtifact.executionMode`

***

### hardkasVersion

> **hardkasVersion**: `string`

Defined in: packages/artifacts/dist/index.d.ts:4725

#### Inherited from

`BaseArtifact.hardkasVersion`

***

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

Defined in: packages/artifacts/dist/index.d.ts:4727

#### Inherited from

`BaseArtifact.hashVersion`

***

### lineage?

> `optional` **lineage?**: `object`

Defined in: packages/artifacts/dist/index.d.ts:4736

#### artifactId

> **artifactId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

#### lineageId?

> `optional` **lineageId?**: [`LineageId`](../type-aliases/LineageId.md)

Absent on a version-5 root (it would be a self reference); required on children.

#### parentArtifactId?

> `optional` **parentArtifactId?**: [`ArtifactId`](../type-aliases/ArtifactId.md)

#### rootArtifactId?

> `optional` **rootArtifactId?**: [`ArtifactId`](../type-aliases/ArtifactId.md)

Absent on a version-5 root; on children, the root's real artifactId.

#### sequence?

> `optional` **sequence?**: `number` \| `EventSequence`

#### Inherited from

`BaseArtifact.lineage`

***

### mode

> **mode**: `AnyExecutionMode`

Defined in: packages/artifacts/dist/index.d.ts:4729

#### Inherited from

`BaseArtifact.mode`

***

### networkId

> **networkId**: [`NetworkId`](../type-aliases/NetworkId.md)

Defined in: packages/artifacts/dist/index.d.ts:4728

#### Inherited from

`BaseArtifact.networkId`

***

### schema

> **schema**: `"hardkas.txTrace"`

Defined in: packages/artifacts/dist/index.d.ts:4723

#### Inherited from

`BaseArtifact.schema`

***

### schemaVersion?

> `optional` **schemaVersion?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:4724

#### Inherited from

`BaseArtifact.schemaVersion`

***

### steps

> **steps**: `object`[]

Defined in: packages/artifacts/dist/index.d.ts:5160

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

Defined in: packages/artifacts/dist/index.d.ts:5159

***

### version

> **version**: `string`

Defined in: packages/artifacts/dist/index.d.ts:4726

#### Inherited from

`BaseArtifact.version`

***

### workflowId?

> `optional` **workflowId?**: `WorkflowId`

Defined in: packages/artifacts/dist/index.d.ts:4732

#### Inherited from

`BaseArtifact.workflowId`
