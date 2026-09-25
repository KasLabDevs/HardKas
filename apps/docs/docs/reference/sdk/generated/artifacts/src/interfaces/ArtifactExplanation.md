[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ArtifactExplanation

# Interface: ArtifactExplanation

Defined in: [packages/artifacts/src/explain.ts:9](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/explain.ts#L9)

## Properties

### economics?

> `optional` **economics?**: `object`

Defined in: [packages/artifacts/src/explain.ts:25](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/explain.ts#L25)

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

Defined in: [packages/artifacts/src/explain.ts:18](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/explain.ts#L18)

#### artifactId

> **artifactId**: `string`

#### contentHash

> **contentHash**: `string`

#### lineageId?

> `optional` **lineageId?**: `string`

#### parentArtifactId?

> `optional` **parentArtifactId?**: `string`

#### rootArtifactId?

> `optional` **rootArtifactId?**: `string`

***

### metadata

> **metadata**: `Record`\<`string`, `any`\>

Defined in: [packages/artifacts/src/explain.ts:39](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/explain.ts#L39)

***

### security

> **security**: `object`

Defined in: [packages/artifacts/src/explain.ts:31](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/explain.ts#L31)

#### issues

> **issues**: `object`[]

#### strictOk

> **strictOk**: `boolean`

***

### summary

> **summary**: `object`

Defined in: [packages/artifacts/src/explain.ts:10](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/explain.ts#L10)

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
