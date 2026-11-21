[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / SignedTxArtifact

# Interface: SignedTxArtifact

Defined in: packages/artifacts/dist/index.d.ts:5022

## Extends

- `BaseArtifact`\<`"signedTx"`\>

## Properties

### amountSompi

> **amountSompi**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5037

***

### assumptionLevel?

> `optional` **assumptionLevel?**: `AssumptionLevel`

Defined in: packages/artifacts/dist/index.d.ts:4733

#### Inherited from

`BaseArtifact.assumptionLevel`

***

### assumptionRef?

> `optional` **assumptionRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5066

***

### authorization?

> `optional` **authorization?**: `object`

Defined in: packages/artifacts/dist/index.d.ts:5045

Wave 1.4 · IC-6′: the authenticated binding of a simulator authorization to its plan.

#### kind

> **kind**: `"synthetic"`

#### planArtifactId

> **planArtifactId**: `string`

#### signers

> **signers**: `string`[]

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

### execution

> **execution**: `object`

Defined in: packages/artifacts/dist/index.d.ts:5023

#### domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"`

#### mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"`

#### network

> **network**: `string`

#### Overrides

`BaseArtifact.execution`

***

### executionMode?

> `optional` **executionMode?**: `AnyExecutionMode`

Defined in: packages/artifacts/dist/index.d.ts:4734

#### Inherited from

`BaseArtifact.executionMode`

***

### from

> **from**: `object`

Defined in: packages/artifacts/dist/index.d.ts:5027

#### accountName?

> `optional` **accountName?**: `string`

#### address

> **address**: [`KaspaAddress`](../type-aliases/KaspaAddress.md)

#### input?

> `optional` **input?**: `string`

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

### metadata?

> `optional` **metadata?**: `any`

Defined in: packages/artifacts/dist/index.d.ts:5067

***

### mode

> **mode**: `AnyExecutionMode`

Defined in: packages/artifacts/dist/index.d.ts:4729

#### Inherited from

`BaseArtifact.mode`

***

### multisig?

> `optional` **multisig?**: `object`

Defined in: packages/artifacts/dist/index.d.ts:5050

#### requiredSigners

> **requiredSigners**: `string`[]

#### signatures

> **signatures**: `object`[]

#### threshold

> **threshold**: `number`

***

### networkId

> **networkId**: [`NetworkId`](../type-aliases/NetworkId.md)

Defined in: packages/artifacts/dist/index.d.ts:4728

#### Inherited from

`BaseArtifact.networkId`

***

### networkProfileRef?

> `optional` **networkProfileRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5063

***

### policyRef?

> `optional` **policyRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5064

***

### policyRefs?

> `optional` **policyRefs?**: `string`[]

Defined in: packages/artifacts/dist/index.d.ts:5065

***

### schema

> **schema**: `"hardkas.signedTx"`

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

### signatureMetadata?

> `optional` **signatureMetadata?**: `object`[]

Defined in: packages/artifacts/dist/index.d.ts:5059

#### signedAt

> **signedAt**: `string`

#### signer

> **signer**: `string`

***

### signedId

> **signedId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

Defined in: packages/artifacts/dist/index.d.ts:5025

***

### signedTransaction?

> `optional` **signedTransaction?**: `object`

Defined in: packages/artifacts/dist/index.d.ts:5039

#### format

> **format**: `string`

#### payload

> **payload**: `string`

***

### sourcePlanId

> **sourcePlanId**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5026

***

### status

> **status**: `"signed"` \| `"partially_signed"`

Defined in: packages/artifacts/dist/index.d.ts:5024

***

### to

> **to**: `object`

Defined in: packages/artifacts/dist/index.d.ts:5032

#### accountName?

> `optional` **accountName?**: `string`

#### address

> **address**: [`KaspaAddress`](../type-aliases/KaspaAddress.md)

#### input?

> `optional` **input?**: `string`

***

### txId?

> `optional` **txId?**: [`TxId`](../type-aliases/TxId.md)

Defined in: packages/artifacts/dist/index.d.ts:5043

***

### unsignedPayloadHash?

> `optional` **unsignedPayloadHash?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5038

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
