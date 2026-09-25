[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / SignedTxArtifact

# Interface: SignedTxArtifact

Defined in: packages/artifacts/dist/index.d.ts:8739

## Extends

- `BaseArtifact`\<`"signedTx"`\>

## Properties

### amountSompi

> **amountSompi**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8754

***

### assumptionLevel?

> `optional` **assumptionLevel?**: `AssumptionLevel`

Defined in: packages/artifacts/dist/index.d.ts:8454

#### Inherited from

`BaseArtifact.assumptionLevel`

***

### assumptionRef?

> `optional` **assumptionRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8776

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

### execution

> **execution**: `object`

Defined in: packages/artifacts/dist/index.d.ts:8740

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

Defined in: packages/artifacts/dist/index.d.ts:8455

#### Inherited from

`BaseArtifact.executionMode`

***

### from

> **from**: `object`

Defined in: packages/artifacts/dist/index.d.ts:8744

#### accountName?

> `optional` **accountName?**: `string`

#### address

> **address**: [`KaspaAddress`](../type-aliases/KaspaAddress.md)

#### input?

> `optional` **input?**: `string`

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

### metadata?

> `optional` **metadata?**: `any`

Defined in: packages/artifacts/dist/index.d.ts:8777

***

### mode

> **mode**: `AnyExecutionMode`

Defined in: packages/artifacts/dist/index.d.ts:8450

#### Inherited from

`BaseArtifact.mode`

***

### multisig?

> `optional` **multisig?**: `object`

Defined in: packages/artifacts/dist/index.d.ts:8761

#### requiredSigners

> **requiredSigners**: `string`[]

#### signatures

> **signatures**: `object`[]

#### threshold

> **threshold**: `number`

***

### networkId

> **networkId**: [`NetworkId`](../type-aliases/NetworkId.md)

Defined in: packages/artifacts/dist/index.d.ts:8449

#### Inherited from

`BaseArtifact.networkId`

***

### networkProfileRef?

> `optional` **networkProfileRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8773

***

### policyRef?

> `optional` **policyRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8774

***

### policyRefs?

> `optional` **policyRefs?**: `string`[]

Defined in: packages/artifacts/dist/index.d.ts:8775

***

### schema

> **schema**: `"hardkas.signedTx"`

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

### signatureMetadata?

> `optional` **signatureMetadata?**: `object`[]

Defined in: packages/artifacts/dist/index.d.ts:8769

#### signedAt

> **signedAt**: `string`

#### signer

> **signer**: `string`

***

### signedId

> **signedId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

Defined in: packages/artifacts/dist/index.d.ts:8742

***

### signedTransaction?

> `optional` **signedTransaction?**: `object`

Defined in: packages/artifacts/dist/index.d.ts:8756

#### format

> **format**: `string`

#### payload

> **payload**: `string`

***

### sourcePlanId

> **sourcePlanId**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8743

***

### status

> **status**: `"signed"` \| `"partially_signed"`

Defined in: packages/artifacts/dist/index.d.ts:8741

***

### to

> **to**: `object`

Defined in: packages/artifacts/dist/index.d.ts:8749

#### accountName?

> `optional` **accountName?**: `string`

#### address

> **address**: [`KaspaAddress`](../type-aliases/KaspaAddress.md)

#### input?

> `optional` **input?**: `string`

***

### txId?

> `optional` **txId?**: [`TxId`](../type-aliases/TxId.md)

Defined in: packages/artifacts/dist/index.d.ts:8760

***

### unsignedPayloadHash?

> `optional` **unsignedPayloadHash?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8755

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
