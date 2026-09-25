[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / SilverDeploySimulationArtifact

# Interface: SilverDeploySimulationArtifact

Defined in: [packages/artifacts/src/types.ts:687](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L687)

## Extends

- [`BaseArtifact`](BaseArtifact.md)\<`"silver.deploySimulation"`\>

## Properties

### amountSompi

> **amountSompi**: `string`

Defined in: [packages/artifacts/src/types.ts:700](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L700)

***

### assumptionLevel?

> `optional` **assumptionLevel?**: [`AssumptionLevel`](../type-aliases/AssumptionLevel.md)

Defined in: [packages/artifacts/src/types.ts:44](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L44)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`assumptionLevel`](BaseArtifact.md#assumptionlevel)

***

### compileArtifactHash

> **compileArtifactHash**: `string`

Defined in: [packages/artifacts/src/types.ts:689](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L689)

***

### compiledScriptHash

> **compiledScriptHash**: `string`

Defined in: [packages/artifacts/src/types.ts:690](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L690)

***

### contentHash?

> `optional` **contentHash?**: `ContentHash`

Defined in: [packages/artifacts/src/types.ts:42](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L42)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`contentHash`](BaseArtifact.md#contenthash)

***

### createdAt

> **createdAt**: `string`

Defined in: [packages/artifacts/src/types.ts:40](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L40)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`createdAt`](BaseArtifact.md#createdat)

***

### deployPlanHash

> **deployPlanHash**: `string`

Defined in: [packages/artifacts/src/types.ts:688](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L688)

***

### execution?

> `optional` **execution?**: `object`

Defined in: [packages/artifacts/src/types.ts:46](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L46)

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

Defined in: [packages/artifacts/src/types.ts:45](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L45)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`executionMode`](BaseArtifact.md#executionmode)

***

### feeSompi

> **feeSompi**: `string`

Defined in: [packages/artifacts/src/types.ts:701](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L701)

***

### hardkasVersion

> **hardkasVersion**: `string`

Defined in: [packages/artifacts/src/types.ts:35](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L35)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`hardkasVersion`](BaseArtifact.md#hardkasversion)

***

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

Defined in: [packages/artifacts/src/types.ts:37](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L37)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`hashVersion`](BaseArtifact.md#hashversion)

***

### lineage?

> `optional` **lineage?**: `object`

Defined in: [packages/artifacts/src/types.ts:48](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L48)

#### artifactId

> **artifactId**: [`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

#### lineageId

> **lineageId**: [`LineageId`](../../../sdk/src/type-aliases/LineageId.md)

#### parentArtifactId?

> `optional` **parentArtifactId?**: [`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

#### rootArtifactId

> **rootArtifactId**: [`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

#### sequence?

> `optional` **sequence?**: `number` \| `EventSequence`

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`lineage`](BaseArtifact.md#lineage)

***

### lockingScriptHex

> **lockingScriptHex**: `string`

Defined in: [packages/artifacts/src/types.ts:693](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L693)

***

### mode

> **mode**: [`AnyExecutionMode`](../type-aliases/AnyExecutionMode.md)

Defined in: [packages/artifacts/src/types.ts:39](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L39)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`mode`](BaseArtifact.md#mode)

***

### networkId

> **networkId**: [`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

Defined in: [packages/artifacts/src/types.ts:38](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L38)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`networkId`](BaseArtifact.md#networkid)

***

### redeemScriptHash

> **redeemScriptHash**: `string`

Defined in: [packages/artifacts/src/types.ts:692](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L692)

***

### redeemScriptHex

> **redeemScriptHex**: `string`

Defined in: [packages/artifacts/src/types.ts:691](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L691)

***

### schema

> **schema**: `"hardkas.silver.deploySimulation"`

Defined in: [packages/artifacts/src/types.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L33)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`schema`](BaseArtifact.md#schema)

***

### schemaVersion?

> `optional` **schemaVersion?**: `string`

Defined in: [packages/artifacts/src/types.ts:34](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L34)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`schemaVersion`](BaseArtifact.md#schemaversion)

***

### scriptPublicKeyVersion

> **scriptPublicKeyVersion**: `0`

Defined in: [packages/artifacts/src/types.ts:694](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L694)

***

### simulatedDeployTxId

> **simulatedDeployTxId**: `string`

Defined in: [packages/artifacts/src/types.ts:695](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L695)

***

### status

> **status**: `"SIMULATED_ACCEPTED"`

Defined in: [packages/artifacts/src/types.ts:702](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L702)

***

### syntheticOutpoint

> **syntheticOutpoint**: `object`

Defined in: [packages/artifacts/src/types.ts:696](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L696)

#### index

> **index**: `number`

#### transactionId

> **transactionId**: `string`

***

### version

> **version**: `string`

Defined in: [packages/artifacts/src/types.ts:36](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L36)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`version`](BaseArtifact.md#version)

***

### workflowId?

> `optional` **workflowId?**: `WorkflowId`

Defined in: [packages/artifacts/src/types.ts:43](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L43)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`workflowId`](BaseArtifact.md#workflowid)
