[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / TxReceiptArtifact

# Interface: TxReceiptArtifact

Defined in: [packages/artifacts/dist/index.d.ts:12098](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12098)

## Extends

- `BaseArtifact`\<`"txReceipt"`\>

## Properties

### amountSompi

> **amountSompi**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12108](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12108)

***

### assumptionLevel?

> `optional` **assumptionLevel?**: `AssumptionLevel`

Defined in: [packages/artifacts/dist/index.d.ts:11736](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11736)

#### Inherited from

`BaseArtifact.assumptionLevel`

***

### assumptionRef?

> `optional` **assumptionRef?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12122](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12122)

***

### confirmedAt?

> `optional` **confirmedAt?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12113](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12113)

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

### daaScore?

> `optional` **daaScore?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12111](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12111)

***

### execution

> **execution**: `object`

Defined in: [packages/artifacts/dist/index.d.ts:12099](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12099)

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

`BaseArtifact.executionMode`

***

### feeSompi

> **feeSompi**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12109](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12109)

***

### from

> **from**: `object`

Defined in: [packages/artifacts/dist/index.d.ts:12102](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12102)

#### address

> **address**: [`KaspaAddress`](../type-aliases/KaspaAddress.md)

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

### mass?

> `optional` **mass?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12110](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12110)

***

### metadata?

> `optional` **metadata?**: `any`

Defined in: [packages/artifacts/dist/index.d.ts:12123](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12123)

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

### networkProfileRef?

> `optional` **networkProfileRef?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12119](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12119)

***

### policyRef?

> `optional` **policyRef?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12120](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12120)

***

### policyRefs?

> `optional` **policyRefs?**: `string`[]

Defined in: [packages/artifacts/dist/index.d.ts:12121](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12121)

***

### postStateHash?

> `optional` **postStateHash?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12115](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12115)

***

### preStateHash?

> `optional` **preStateHash?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12114](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12114)

***

### rpcUrl?

> `optional` **rpcUrl?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12117](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12117)

***

### schema

> **schema**: `"hardkas.txReceipt"`

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

### sourceSignedId?

> `optional` **sourceSignedId?**: [`ArtifactId`](../type-aliases/ArtifactId.md)

Defined in: [packages/artifacts/dist/index.d.ts:12118](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12118)

***

### status

> **status**: `"submitted"` \| `"accepted"` \| `"confirmed"` \| `"failed"` \| `"pending"`

Defined in: [packages/artifacts/dist/index.d.ts:12101](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12101)

***

### submittedAt?

> `optional` **submittedAt?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12112](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12112)

***

### to

> **to**: `object`

Defined in: [packages/artifacts/dist/index.d.ts:12105](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12105)

#### address

> **address**: [`KaspaAddress`](../type-aliases/KaspaAddress.md)

***

### tracePath?

> `optional` **tracePath?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12116](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12116)

***

### txId

> **txId**: [`TxId`](../type-aliases/TxId.md)

Defined in: [packages/artifacts/dist/index.d.ts:12100](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12100)

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
