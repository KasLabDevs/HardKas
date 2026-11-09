[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / SilverDeployPlanArtifact

# Interface: SilverDeployPlanArtifact

Defined in: [packages/artifacts/src/types.ts:650](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L650)

## Extends

- [`BaseArtifact`](BaseArtifact.md)\<`"silver.deployPlan"`\>

## Properties

### amountSompi

> **amountSompi**: `string`

Defined in: [packages/artifacts/src/types.ts:657](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L657)

***

### assumptionLevel?

> `optional` **assumptionLevel?**: [`AssumptionLevel`](../type-aliases/AssumptionLevel.md)

Defined in: [packages/artifacts/src/types.ts:44](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L44)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`assumptionLevel`](BaseArtifact.md#assumptionlevel)

***

### compileArtifactHash

> **compileArtifactHash**: `string`

Defined in: [packages/artifacts/src/types.ts:651](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L651)

***

### compiledScriptHash

> **compiledScriptHash**: `string`

Defined in: [packages/artifacts/src/types.ts:652](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L652)

***

### contentHash?

> `optional` **contentHash?**: `ContentHash`

Defined in: [packages/artifacts/src/types.ts:42](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L42)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`contentHash`](BaseArtifact.md#contenthash)

***

### createdAt

> **createdAt**: `string`

Defined in: [packages/artifacts/src/types.ts:40](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L40)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`createdAt`](BaseArtifact.md#createdat)

***

### deployerAddress

> **deployerAddress**: `string`

Defined in: [packages/artifacts/src/types.ts:658](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L658)

***

### execution?

> `optional` **execution?**: `object`

Defined in: [packages/artifacts/src/types.ts:46](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L46)

#### domain

> **domain**: `"kaspa-l1"` \| `"evm-l2"`

#### mode

> **mode**: `"rpc"` \| `"simulator"` \| `"localnet"`

#### network

> **network**: `string`

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`execution`](BaseArtifact.md#execution)

***

### executionMode?

> `optional` **executionMode?**: [`AnyExecutionMode`](../type-aliases/AnyExecutionMode.md)

Defined in: [packages/artifacts/src/types.ts:45](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L45)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`executionMode`](BaseArtifact.md#executionmode)

***

### hardkasVersion

> **hardkasVersion**: `string`

Defined in: [packages/artifacts/src/types.ts:35](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L35)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`hardkasVersion`](BaseArtifact.md#hardkasversion)

***

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

Defined in: [packages/artifacts/src/types.ts:37](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L37)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`hashVersion`](BaseArtifact.md#hashversion)

***

### lineage?

> `optional` **lineage?**: `object`

Defined in: [packages/artifacts/src/types.ts:48](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L48)

#### artifactId

> **artifactId**: [`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

#### lineageId?

> `optional` **lineageId?**: [`LineageId`](../../../sdk/src/type-aliases/LineageId.md)

Absent on a version-5 root (it would be a self reference); required on children.

#### parentArtifactId?

> `optional` **parentArtifactId?**: [`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

#### rootArtifactId?

> `optional` **rootArtifactId?**: [`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

Absent on a version-5 root; on children, the root's real artifactId.

#### sequence?

> `optional` **sequence?**: `number` \| `EventSequence`

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`lineage`](BaseArtifact.md#lineage)

***

### lockingScriptHex

> **lockingScriptHex**: `string`

Defined in: [packages/artifacts/src/types.ts:655](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L655)

***

### mode

> **mode**: [`AnyExecutionMode`](../type-aliases/AnyExecutionMode.md)

Defined in: [packages/artifacts/src/types.ts:39](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L39)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`mode`](BaseArtifact.md#mode)

***

### networkId

> **networkId**: [`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

Defined in: [packages/artifacts/src/types.ts:38](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L38)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`networkId`](BaseArtifact.md#networkid)

***

### redeemScriptHash

> **redeemScriptHash**: `string`

Defined in: [packages/artifacts/src/types.ts:654](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L654)

***

### redeemScriptHex

> **redeemScriptHex**: `string`

Defined in: [packages/artifacts/src/types.ts:653](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L653)

***

### schema

> **schema**: `"hardkas.silver.deployPlan"`

Defined in: [packages/artifacts/src/types.ts:33](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L33)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`schema`](BaseArtifact.md#schema)

***

### schemaVersion?

> `optional` **schemaVersion?**: `string`

Defined in: [packages/artifacts/src/types.ts:34](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L34)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`schemaVersion`](BaseArtifact.md#schemaversion)

***

### scriptPublicKeyVersion

> **scriptPublicKeyVersion**: `number`

Defined in: [packages/artifacts/src/types.ts:656](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L656)

***

### version

> **version**: `string`

Defined in: [packages/artifacts/src/types.ts:36](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L36)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`version`](BaseArtifact.md#version)

***

### workflowId?

> `optional` **workflowId?**: `WorkflowId`

Defined in: [packages/artifacts/src/types.ts:43](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L43)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`workflowId`](BaseArtifact.md#workflowid)
