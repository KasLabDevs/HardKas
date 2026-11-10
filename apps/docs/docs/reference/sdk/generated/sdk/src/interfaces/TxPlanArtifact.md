[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / TxPlanArtifact

# Interface: TxPlanArtifact

Defined in: [packages/artifacts/dist/index.d.ts:11940](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11940)

## Extends

- `BaseArtifact`\<`"txPlan"`\>

## Properties

### amountSompi

> **amountSompi**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:11953](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11953)

***

### assumptionLevel?

> `optional` **assumptionLevel?**: `AssumptionLevel`

Defined in: [packages/artifacts/dist/index.d.ts:11736](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11736)

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`assumptionLevel`](TxTraceArtifact.md#assumptionlevel)

***

### assumptionRef?

> `optional` **assumptionRef?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:11984](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11984)

***

### change?

> `optional` **change?**: `object`

Defined in: [packages/artifacts/dist/index.d.ts:11977](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11977)

#### address

> **address**: `string`

#### amountSompi

> **amountSompi**: `string`

***

### computeBudget?

> `optional` **computeBudget?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:11956](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11956)

***

### contentHash?

> `optional` **contentHash?**: `ContentHash`

Defined in: [packages/artifacts/dist/index.d.ts:11734](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11734)

#### Inherited from

`BaseArtifact.contentHash`

***

### createdAt

> **createdAt**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:11733](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11733)

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`createdAt`](TxTraceArtifact.md#createdat)

***

### estimatedFeeSompi

> **estimatedFeeSompi**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:11954](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11954)

***

### estimatedMass

> **estimatedMass**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:11955](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11955)

***

### execution

> **execution**: `object`

Defined in: [packages/artifacts/dist/index.d.ts:11941](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11941)

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

Defined in: [packages/artifacts/dist/index.d.ts:11737](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11737)

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`executionMode`](TxTraceArtifact.md#executionmode)

***

### from

> **from**: `object`

Defined in: [packages/artifacts/dist/index.d.ts:11943](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11943)

#### accountName?

> `optional` **accountName?**: `string`

#### address

> **address**: `string`

#### input?

> `optional` **input?**: `string`

***

### genesisCovenantGroups?

> `optional` **genesisCovenantGroups?**: `object`[]

Defined in: [packages/artifacts/dist/index.d.ts:11973](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11973)

#### authorizingInput

> **authorizingInput**: `number`

#### outputs

> **outputs**: `number`[]

***

### hardkasVersion

> **hardkasVersion**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:11728](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11728)

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`hardkasVersion`](TxTraceArtifact.md#hardkasversion)

***

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

Defined in: [packages/artifacts/dist/index.d.ts:11730](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11730)

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`hashVersion`](TxTraceArtifact.md#hashversion)

***

### inputs

> **inputs**: `object`[]

Defined in: [packages/artifacts/dist/index.d.ts:11960](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11960)

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

Defined in: [packages/artifacts/dist/index.d.ts:11958](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11958)

***

### lineage?

> `optional` **lineage?**: `object`

Defined in: [packages/artifacts/dist/index.d.ts:11739](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11739)

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

Defined in: [packages/artifacts/dist/index.d.ts:11732](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11732)

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`mode`](TxTraceArtifact.md#mode)

***

### networkId

> **networkId**: [`NetworkId`](../type-aliases/NetworkId.md)

Defined in: [packages/artifacts/dist/index.d.ts:11731](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11731)

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`networkId`](TxTraceArtifact.md#networkid)

***

### networkProfileRef?

> `optional` **networkProfileRef?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:11981](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11981)

***

### outputs

> **outputs**: `object`[]

Defined in: [packages/artifacts/dist/index.d.ts:11968](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11968)

#### address

> **address**: `string`

#### amountSompi

> **amountSompi**: `string`

#### covenant?

> `optional` **covenant?**: `CovenantBindingArtifact`

***

### planId

> **planId**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:11942](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11942)

***

### policyRef?

> `optional` **policyRef?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:11982](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11982)

***

### policyRefs?

> `optional` **policyRefs?**: `string`[]

Defined in: [packages/artifacts/dist/index.d.ts:11983](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11983)

***

### schema

> **schema**: `"hardkas.txPlan"`

Defined in: [packages/artifacts/dist/index.d.ts:11726](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11726)

#### Inherited from

`BaseArtifact.schema`

***

### schemaVersion?

> `optional` **schemaVersion?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:11727](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11727)

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`schemaVersion`](TxTraceArtifact.md#schemaversion)

***

### storageMass?

> `optional` **storageMass?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:11957](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11957)

***

### to

> **to**: `object`

Defined in: [packages/artifacts/dist/index.d.ts:11948](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11948)

#### accountName?

> `optional` **accountName?**: `string`

#### address

> **address**: `string`

#### input?

> `optional` **input?**: `string`

***

### txVersion?

> `optional` **txVersion?**: `number`

Defined in: [packages/artifacts/dist/index.d.ts:11959](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11959)

***

### version

> **version**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:11729](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11729)

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`version`](TxTraceArtifact.md#version)

***

### workflowId?

> `optional` **workflowId?**: `WorkflowId`

Defined in: [packages/artifacts/dist/index.d.ts:11735](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11735)

#### Inherited from

[`TxTraceArtifact`](TxTraceArtifact.md).[`workflowId`](TxTraceArtifact.md#workflowid)
