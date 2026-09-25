[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / TxReceiptArtifact

# Interface: TxReceiptArtifact

Defined in: packages/artifacts/dist/index.d.ts:8805

## Extends

- `BaseArtifact`\<`"txReceipt"`\>

## Properties

### amountSompi

> **amountSompi**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8815

***

### assumptionLevel?

> `optional` **assumptionLevel?**: `AssumptionLevel`

Defined in: packages/artifacts/dist/index.d.ts:8454

#### Inherited from

`BaseArtifact.assumptionLevel`

***

### assumptionRef?

> `optional` **assumptionRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8829

***

### confirmedAt?

> `optional` **confirmedAt?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8820

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

### daaScore?

> `optional` **daaScore?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8818

***

### execution

> **execution**: `object`

Defined in: packages/artifacts/dist/index.d.ts:8806

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

### feeSompi

> **feeSompi**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8816

***

### from

> **from**: `object`

Defined in: packages/artifacts/dist/index.d.ts:8809

#### address

> **address**: [`KaspaAddress`](../type-aliases/KaspaAddress.md)

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

### mass?

> `optional` **mass?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8817

***

### metadata?

> `optional` **metadata?**: `any`

Defined in: packages/artifacts/dist/index.d.ts:8830

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

### networkProfileRef?

> `optional` **networkProfileRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8826

***

### policyRef?

> `optional` **policyRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8827

***

### policyRefs?

> `optional` **policyRefs?**: `string`[]

Defined in: packages/artifacts/dist/index.d.ts:8828

***

### postStateHash?

> `optional` **postStateHash?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8822

***

### preStateHash?

> `optional` **preStateHash?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8821

***

### rpcUrl?

> `optional` **rpcUrl?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8824

***

### schema

> **schema**: `"hardkas.txReceipt"`

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

### sourceSignedId?

> `optional` **sourceSignedId?**: [`ArtifactId`](../type-aliases/ArtifactId.md)

Defined in: packages/artifacts/dist/index.d.ts:8825

***

### status

> **status**: `"submitted"` \| `"accepted"` \| `"confirmed"` \| `"failed"` \| `"pending"`

Defined in: packages/artifacts/dist/index.d.ts:8808

***

### submittedAt?

> `optional` **submittedAt?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8819

***

### to

> **to**: `object`

Defined in: packages/artifacts/dist/index.d.ts:8812

#### address

> **address**: [`KaspaAddress`](../type-aliases/KaspaAddress.md)

***

### tracePath?

> `optional` **tracePath?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8823

***

### txId

> **txId**: [`TxId`](../type-aliases/TxId.md)

Defined in: packages/artifacts/dist/index.d.ts:8807

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
