[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / SignedTxArtifact

# Interface: SignedTxArtifact

Defined in: [packages/artifacts/dist/index.d.ts:12025](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12025)

## Extends

- `BaseArtifact`\<`"signedTx"`\>

## Properties

### amountSompi

> **amountSompi**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12040](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12040)

***

### assumptionLevel?

> `optional` **assumptionLevel?**: `AssumptionLevel`

Defined in: [packages/artifacts/dist/index.d.ts:11736](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11736)

#### Inherited from

`BaseArtifact.assumptionLevel`

***

### assumptionRef?

> `optional` **assumptionRef?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12069](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12069)

***

### authorization?

> `optional` **authorization?**: `object`

Defined in: [packages/artifacts/dist/index.d.ts:12048](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12048)

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

### execution

> **execution**: `object`

Defined in: [packages/artifacts/dist/index.d.ts:12026](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12026)

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

### from

> **from**: `object`

Defined in: [packages/artifacts/dist/index.d.ts:12030](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12030)

#### accountName?

> `optional` **accountName?**: `string`

#### address

> **address**: [`KaspaAddress`](../type-aliases/KaspaAddress.md)

#### input?

> `optional` **input?**: `string`

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

### metadata?

> `optional` **metadata?**: `any`

Defined in: [packages/artifacts/dist/index.d.ts:12070](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12070)

***

### mode

> **mode**: `AnyExecutionMode`

Defined in: [packages/artifacts/dist/index.d.ts:11732](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11732)

#### Inherited from

`BaseArtifact.mode`

***

### multisig?

> `optional` **multisig?**: `object`

Defined in: [packages/artifacts/dist/index.d.ts:12053](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12053)

#### requiredSigners

> **requiredSigners**: `string`[]

#### signatures

> **signatures**: `object`[]

#### threshold

> **threshold**: `number`

***

### networkId

> **networkId**: [`NetworkId`](../type-aliases/NetworkId.md)

Defined in: [packages/artifacts/dist/index.d.ts:11731](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L11731)

#### Inherited from

`BaseArtifact.networkId`

***

### networkProfileRef?

> `optional` **networkProfileRef?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12066](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12066)

***

### policyRef?

> `optional` **policyRef?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12067](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12067)

***

### policyRefs?

> `optional` **policyRefs?**: `string`[]

Defined in: [packages/artifacts/dist/index.d.ts:12068](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12068)

***

### schema

> **schema**: `"hardkas.signedTx"`

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

### signatureMetadata?

> `optional` **signatureMetadata?**: `object`[]

Defined in: [packages/artifacts/dist/index.d.ts:12062](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12062)

#### signedAt

> **signedAt**: `string`

#### signer

> **signer**: `string`

***

### signedId

> **signedId**: [`ArtifactId`](../type-aliases/ArtifactId.md)

Defined in: [packages/artifacts/dist/index.d.ts:12028](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12028)

***

### signedTransaction?

> `optional` **signedTransaction?**: `object`

Defined in: [packages/artifacts/dist/index.d.ts:12042](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12042)

#### format

> **format**: `string`

#### payload

> **payload**: `string`

***

### sourcePlanId

> **sourcePlanId**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12029](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12029)

***

### status

> **status**: `"signed"` \| `"partially_signed"`

Defined in: [packages/artifacts/dist/index.d.ts:12027](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12027)

***

### to

> **to**: `object`

Defined in: [packages/artifacts/dist/index.d.ts:12035](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12035)

#### accountName?

> `optional` **accountName?**: `string`

#### address

> **address**: [`KaspaAddress`](../type-aliases/KaspaAddress.md)

#### input?

> `optional` **input?**: `string`

***

### txId?

> `optional` **txId?**: [`TxId`](../type-aliases/TxId.md)

Defined in: [packages/artifacts/dist/index.d.ts:12046](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12046)

***

### unsignedPayloadHash?

> `optional` **unsignedPayloadHash?**: `string`

Defined in: [packages/artifacts/dist/index.d.ts:12041](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/dist/index.d.ts#L12041)

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
