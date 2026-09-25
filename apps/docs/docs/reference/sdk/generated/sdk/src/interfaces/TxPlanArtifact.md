[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / TxPlanArtifact

# Interface: TxPlanArtifact

Defined in: packages/artifacts/dist/index.d.ts:8654

## Extends

- `BaseArtifact`\<`"txPlan"`\>

## Properties

### amountSompi

> **amountSompi**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8667

***

### assumptionLevel?

> `optional` **assumptionLevel?**: `AssumptionLevel`

Defined in: packages/artifacts/dist/index.d.ts:8454

#### Inherited from

[`SignedTxArtifact`](SignedTxArtifact.md).[`assumptionLevel`](SignedTxArtifact.md#assumptionlevel)

***

### assumptionRef?

> `optional` **assumptionRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8698

***

### change?

> `optional` **change?**: `object`

Defined in: packages/artifacts/dist/index.d.ts:8691

#### address

> **address**: `string`

#### amountSompi

> **amountSompi**: `string`

***

### computeBudget?

> `optional` **computeBudget?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8670

***

### contentHash?

> `optional` **contentHash?**: `ContentHash`

Defined in: packages/artifacts/dist/index.d.ts:8452

#### Inherited from

[`SignedTxArtifact`](SignedTxArtifact.md).[`contentHash`](SignedTxArtifact.md#contenthash)

***

### createdAt

> **createdAt**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8451

#### Inherited from

[`SignedTxArtifact`](SignedTxArtifact.md).[`createdAt`](SignedTxArtifact.md#createdat)

***

### estimatedFeeSompi

> **estimatedFeeSompi**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8668

***

### estimatedMass

> **estimatedMass**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8669

***

### execution

> **execution**: `object`

Defined in: packages/artifacts/dist/index.d.ts:8655

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

[`SignedTxArtifact`](SignedTxArtifact.md).[`executionMode`](SignedTxArtifact.md#executionmode)

***

### from

> **from**: `object`

Defined in: packages/artifacts/dist/index.d.ts:8657

#### accountName?

> `optional` **accountName?**: `string`

#### address

> **address**: `string`

#### input?

> `optional` **input?**: `string`

***

### genesisCovenantGroups?

> `optional` **genesisCovenantGroups?**: `object`[]

Defined in: packages/artifacts/dist/index.d.ts:8687

#### authorizingInput

> **authorizingInput**: `number`

#### outputs

> **outputs**: `number`[]

***

### hardkasVersion

> **hardkasVersion**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8446

#### Inherited from

[`SignedTxArtifact`](SignedTxArtifact.md).[`hardkasVersion`](SignedTxArtifact.md#hardkasversion)

***

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

Defined in: packages/artifacts/dist/index.d.ts:8448

#### Inherited from

[`SignedTxArtifact`](SignedTxArtifact.md).[`hashVersion`](SignedTxArtifact.md#hashversion)

***

### inputs

> **inputs**: `object`[]

Defined in: packages/artifacts/dist/index.d.ts:8674

#### amountSompi

> **amountSompi**: `string`

#### covenantId?

> `optional` **covenantId?**: `string`

#### outpoint

> **outpoint**: `object`

##### outpoint.index

> **index**: `number`

##### outpoint.transactionId

> **transactionId**: `string`

***

### lane?

> `optional` **lane?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8672

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

[`SignedTxArtifact`](SignedTxArtifact.md).[`mode`](SignedTxArtifact.md#mode)

***

### networkId

> **networkId**: [`NetworkId`](../type-aliases/NetworkId.md)

Defined in: packages/artifacts/dist/index.d.ts:8449

#### Inherited from

[`SignedTxArtifact`](SignedTxArtifact.md).[`networkId`](SignedTxArtifact.md#networkid)

***

### networkProfileRef?

> `optional` **networkProfileRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8695

***

### outputs

> **outputs**: `object`[]

Defined in: packages/artifacts/dist/index.d.ts:8682

#### address

> **address**: `string`

#### amountSompi

> **amountSompi**: `string`

#### covenant?

> `optional` **covenant?**: `CovenantBindingArtifact`

***

### planId

> **planId**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8656

***

### policyRef?

> `optional` **policyRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8696

***

### policyRefs?

> `optional` **policyRefs?**: `string`[]

Defined in: packages/artifacts/dist/index.d.ts:8697

***

### schema

> **schema**: `"hardkas.txPlan"`

Defined in: packages/artifacts/dist/index.d.ts:8444

#### Inherited from

`BaseArtifact.schema`

***

### schemaVersion?

> `optional` **schemaVersion?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8445

#### Inherited from

[`SignedTxArtifact`](SignedTxArtifact.md).[`schemaVersion`](SignedTxArtifact.md#schemaversion)

***

### storageMass?

> `optional` **storageMass?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8671

***

### to

> **to**: `object`

Defined in: packages/artifacts/dist/index.d.ts:8662

#### accountName?

> `optional` **accountName?**: `string`

#### address

> **address**: `string`

#### input?

> `optional` **input?**: `string`

***

### txVersion?

> `optional` **txVersion?**: `number`

Defined in: packages/artifacts/dist/index.d.ts:8673

***

### version

> **version**: `string`

Defined in: packages/artifacts/dist/index.d.ts:8447

#### Inherited from

[`SignedTxArtifact`](SignedTxArtifact.md).[`version`](SignedTxArtifact.md#version)

***

### workflowId?

> `optional` **workflowId?**: `WorkflowId`

Defined in: packages/artifacts/dist/index.d.ts:8453

#### Inherited from

[`SignedTxArtifact`](SignedTxArtifact.md).[`workflowId`](SignedTxArtifact.md#workflowid)
