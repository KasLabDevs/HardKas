[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / TxReceiptArtifact

# Interface: TxReceiptArtifact

Defined in: packages/artifacts/dist/index.d.ts:5095

## Extends

- `BaseArtifact`\<`"txReceipt"`\>

## Properties

### amountSompi

> **amountSompi**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5105

***

### assumptionLevel?

> `optional` **assumptionLevel?**: `AssumptionLevel`

Defined in: packages/artifacts/dist/index.d.ts:4733

#### Inherited from

`BaseArtifact.assumptionLevel`

***

### assumptionRef?

> `optional` **assumptionRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5119

***

### confirmedAt?

> `optional` **confirmedAt?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5110

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

### daaScore?

> `optional` **daaScore?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5108

***

### execution

> **execution**: `object`

Defined in: packages/artifacts/dist/index.d.ts:5096

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

### feeSompi

> **feeSompi**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5106

***

### from

> **from**: `object`

Defined in: packages/artifacts/dist/index.d.ts:5099

#### address

> **address**: [`KaspaAddress`](../type-aliases/KaspaAddress.md)

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

### mass?

> `optional` **mass?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5107

***

### metadata?

> `optional` **metadata?**: `any`

Defined in: packages/artifacts/dist/index.d.ts:5120

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

### networkProfileRef?

> `optional` **networkProfileRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5116

***

### policyRef?

> `optional` **policyRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5117

***

### policyRefs?

> `optional` **policyRefs?**: `string`[]

Defined in: packages/artifacts/dist/index.d.ts:5118

***

### postStateHash?

> `optional` **postStateHash?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5112

***

### preStateHash?

> `optional` **preStateHash?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5111

***

### rpcUrl?

> `optional` **rpcUrl?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5114

***

### schema

> **schema**: `"hardkas.txReceipt"`

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

### sourceSignedId?

> `optional` **sourceSignedId?**: [`ArtifactId`](../type-aliases/ArtifactId.md)

Defined in: packages/artifacts/dist/index.d.ts:5115

***

### status

> **status**: `"submitted"` \| `"accepted"` \| `"confirmed"` \| `"failed"` \| `"pending"`

Defined in: packages/artifacts/dist/index.d.ts:5098

***

### submittedAt?

> `optional` **submittedAt?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5109

***

### to

> **to**: `object`

Defined in: packages/artifacts/dist/index.d.ts:5102

#### address

> **address**: [`KaspaAddress`](../type-aliases/KaspaAddress.md)

***

### tracePath?

> `optional` **tracePath?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:5113

***

### txId

> **txId**: [`TxId`](../type-aliases/TxId.md)

Defined in: packages/artifacts/dist/index.d.ts:5097

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
