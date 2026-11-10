[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / TxTraceArtifact

# Interface: TxTraceArtifact

Defined in: [packages/artifacts/dist/index.d.ts:12161](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12161)

## Extends

- `BaseArtifact`\<`"txTrace"`\>

## Properties

### assumptionLevel?

> `optional` **assumptionLevel?**: `AssumptionLevel`

Defined in: [packages/artifacts/dist/index.d.ts:11736](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11736)

#### Inherited from

`BaseArtifact.assumptionLevel`

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

`BaseArtifact.createdAt`

***

### dagContext?

> `optional` **dagContext?**: `DagContext`

Defined in: [packages/artifacts/dist/index.d.ts:12169](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12169)

***

### execution?

> `optional` **execution?**: `object`

Defined in: [packages/artifacts/dist/index.d.ts:11738](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11738)

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

Defined in: [packages/artifacts/dist/index.d.ts:11737](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11737)

#### Inherited from

`BaseArtifact.executionMode`

***

### hardkasVersion

> **hardkasVersion**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:11728](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11728)

#### Inherited from

`BaseArtifact.hardkasVersion`

***

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

Defined in: [packages/artifacts/dist/index.d.ts:11730](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11730)

#### Inherited from

`BaseArtifact.hashVersion`

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

`BaseArtifact.mode`

***

### networkId

> **networkId**: [`NetworkId`](../type-aliases/NetworkId.md)

Defined in: [packages/artifacts/dist/index.d.ts:11731](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11731)

#### Inherited from

`BaseArtifact.networkId`

***

### schema

> **schema**: `"hardkas.txTrace"`

Defined in: [packages/artifacts/dist/index.d.ts:11726](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11726)

#### Inherited from

`BaseArtifact.schema`

***

### schemaVersion?

> `optional` **schemaVersion?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:11727](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11727)

#### Inherited from

`BaseArtifact.schemaVersion`

***

### steps

> **steps**: `object`[]

Defined in: [packages/artifacts/dist/index.d.ts:12163](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12163)

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

Defined in: [packages/artifacts/dist/index.d.ts:12162](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12162)

***

### version

> **version**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:11729](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11729)

#### Inherited from

`BaseArtifact.version`

***

### workflowId?

> `optional` **workflowId?**: `WorkflowId`

Defined in: [packages/artifacts/dist/index.d.ts:11735](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11735)

#### Inherited from

`BaseArtifact.workflowId`
