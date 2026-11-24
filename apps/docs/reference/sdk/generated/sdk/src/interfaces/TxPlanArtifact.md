[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / TxPlanArtifact

# Interface: TxPlanArtifact

Defined in: packages/artifacts/dist/index.d.ts:4937

## Extends

- `BaseArtifact`\<`"txPlan"`\>

## Properties

### amountSompi

> **amountSompi**: `string`

Defined in: packages/artifacts/dist/index.d.ts:4950

***

### assumptionLevel?

> `optional` **assumptionLevel?**: `AssumptionLevel`

Defined in: packages/artifacts/dist/index.d.ts:4733

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`assumptionLevel`](TxTraceArtifact.md#assumptionlevel)

***

### assumptionRef?

> `optional` **assumptionRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:4981

***

### change?

> `optional` **change?**: `object`

Defined in: packages/artifacts/dist/index.d.ts:4974

#### address

> **address**: `string`

#### amountSompi

> **amountSompi**: `string`

***

### computeBudget?

> `optional` **computeBudget?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:4953

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

[`TxTraceArtifact`](TxTraceArtifact.md).[`createdAt`](TxTraceArtifact.md#createdat)

***

### estimatedFeeSompi

> **estimatedFeeSompi**: `string`

Defined in: packages/artifacts/dist/index.d.ts:4951

***

### estimatedMass

> **estimatedMass**: `string`

Defined in: packages/artifacts/dist/index.d.ts:4952

***

### execution

> **execution**: `object`

Defined in: packages/artifacts/dist/index.d.ts:4938

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

[`TxTraceArtifact`](TxTraceArtifact.md).[`executionMode`](TxTraceArtifact.md#executionmode)

***

### from

> **from**: `object`

Defined in: packages/artifacts/dist/index.d.ts:4940

#### accountName?

> `optional` **accountName?**: `string`

#### address

> **address**: `string`

#### input?

> `optional` **input?**: `string`

***

### genesisCovenantGroups?

> `optional` **genesisCovenantGroups?**: `object`[]

Defined in: packages/artifacts/dist/index.d.ts:4970

#### authorizingInput

> **authorizingInput**: `number`

#### outputs

> **outputs**: `number`[]

***

### hardkasVersion

> **hardkasVersion**: `string`

Defined in: packages/artifacts/dist/index.d.ts:4725

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`hardkasVersion`](TxTraceArtifact.md#hardkasversion)

***

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

Defined in: packages/artifacts/dist/index.d.ts:4727

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`hashVersion`](TxTraceArtifact.md#hashversion)

***

### inputs

> **inputs**: `object`[]

Defined in: packages/artifacts/dist/index.d.ts:4957

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

Defined in: packages/artifacts/dist/index.d.ts:4955

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

[`TxTraceArtifact`](TxTraceArtifact.md).[`mode`](TxTraceArtifact.md#mode)

***

### networkId

> **networkId**: [`NetworkId`](../type-aliases/NetworkId.md)

Defined in: packages/artifacts/dist/index.d.ts:4728

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`networkId`](TxTraceArtifact.md#networkid)

***

### networkProfileRef?

> `optional` **networkProfileRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:4978

***

### outputs

> **outputs**: `object`[]

Defined in: packages/artifacts/dist/index.d.ts:4965

#### address

> **address**: `string`

#### amountSompi

> **amountSompi**: `string`

#### covenant?

> `optional` **covenant?**: `CovenantBindingArtifact`

***

### planId

> **planId**: `string`

Defined in: packages/artifacts/dist/index.d.ts:4939

***

### policyRef?

> `optional` **policyRef?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:4979

***

### policyRefs?

> `optional` **policyRefs?**: `string`[]

Defined in: packages/artifacts/dist/index.d.ts:4980

***

### schema

> **schema**: `"hardkas.txPlan"`

Defined in: packages/artifacts/dist/index.d.ts:4723

#### Inherited from

`BaseArtifact.schema`

***

### schemaVersion?

> `optional` **schemaVersion?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:4724

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`schemaVersion`](TxTraceArtifact.md#schemaversion)

***

### storageMass?

> `optional` **storageMass?**: `string`

Defined in: packages/artifacts/dist/index.d.ts:4954

***

### to

> **to**: `object`

Defined in: packages/artifacts/dist/index.d.ts:4945

#### accountName?

> `optional` **accountName?**: `string`

#### address

> **address**: `string`

#### input?

> `optional` **input?**: `string`

***

### txVersion?

> `optional` **txVersion?**: `number`

Defined in: packages/artifacts/dist/index.d.ts:4956

***

### version

> **version**: `string`

Defined in: packages/artifacts/dist/index.d.ts:4726

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`version`](TxTraceArtifact.md#version)

***

### workflowId?

> `optional` **workflowId?**: `WorkflowId`

Defined in: packages/artifacts/dist/index.d.ts:4732

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`workflowId`](TxTraceArtifact.md#workflowid)
