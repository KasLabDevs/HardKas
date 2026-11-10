[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ArtifactExplanation

# Interface: ArtifactExplanation

Defined in: [packages/artifacts/src/explain.ts:19](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/explain.ts#L19)

## Properties

### economics?

> `optional` **economics?**: `object`

Defined in: [packages/artifacts/src/explain.ts:40](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/explain.ts#L40)

#### balance

> **balance**: `object`

##### balance.change

> **change**: `bigint`

##### balance.impliedFee

> **impliedFee**: `bigint`

##### balance.inputs

> **inputs**: `bigint`

##### balance.outputs

> **outputs**: `bigint`

#### fee

> **fee**: `object`

##### fee.delta

> **delta**: `bigint`

##### fee.rate

> **rate**: `bigint`

##### fee.recomputed

> **recomputed**: `bigint`

##### fee.reported

> **reported**: `bigint`

#### mass

> **mass**: `object`

##### mass.delta

> **delta**: `bigint`

##### mass.recomputed

> **recomputed**: `bigint`

##### mass.reported

> **reported**: `bigint`

#### ok

> **ok**: `boolean`

***

### identity

> **identity**: `object`

Defined in: [packages/artifacts/src/explain.ts:28](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/explain.ts#L28)

#### artifactId

> **artifactId**: `string`

#### contentHash

> **contentHash**: `string`

#### lineageId?

> `optional` **lineageId?**: `string`

#### parent

> **parent**: [`ParentResolution`](ParentResolution.md)

EVIDENCE-TRUST-1: what looking the parent up found — resolved (a verified copy), missing (searched, not there),
invalid (a copy there does not verify as that identity), unresolved (nowhere was searched), or root (no parent).

#### parentArtifactId?

> `optional` **parentArtifactId?**: `string`

#### rootArtifactId?

> `optional` **rootArtifactId?**: `string`

***

### metadata

> **metadata**: `Record`\<`string`, `any`\>

Defined in: [packages/artifacts/src/explain.ts:54](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/explain.ts#L54)

***

### security

> **security**: `object`

Defined in: [packages/artifacts/src/explain.ts:46](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/explain.ts#L46)

#### issues

> **issues**: `object`[]

#### strictOk

> **strictOk**: `boolean`

***

### summary

> **summary**: `object`

Defined in: [packages/artifacts/src/explain.ts:20](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/explain.ts#L20)

#### createdAt

> **createdAt**: `string`

#### mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"`

#### network

> **network**: `string`

#### status

> **status**: `"legacy"` \| `"valid"` \| `"invalid"` \| `"corrupted"`

#### type

> **type**: `string`

#### version

> **version**: `string`
