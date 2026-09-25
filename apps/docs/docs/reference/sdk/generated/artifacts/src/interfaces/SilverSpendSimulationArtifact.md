[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / SilverSpendSimulationArtifact

# Interface: SilverSpendSimulationArtifact

Defined in: [packages/artifacts/src/types.ts:705](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L705)

## Extends

- [`BaseArtifact`](BaseArtifact.md)\<`"silver.spendSimulation"`\>

## Properties

### assumptionLevel?

> `optional` **assumptionLevel?**: [`AssumptionLevel`](../type-aliases/AssumptionLevel.md)

Defined in: [packages/artifacts/src/types.ts:44](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L44)

#### Inherited from

[`BaseArtifact`](BaseArtifact.md).[`assumptionLevel`](BaseArtifact.md#assumptionlevel)

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

### deploySimulationHash

> **deploySimulationHash**: `string`

Defined in: [packages/artifacts/src/types.ts:706](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L706)

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

### expectedOutputs

> **expectedOutputs**: `object`[]

Defined in: [packages/artifacts/src/types.ts:716](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L716)

#### address

> **address**: `string`

#### amountSompi

> **amountSompi**: `string`

#### scriptHash?

> `optional` **scriptHash?**: `string`

***

### feeSompi

> **feeSompi**: `string`

Defined in: [packages/artifacts/src/types.ts:721](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L721)

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

Defined in: [packages/artifacts/src/types.ts:709](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L709)

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

Defined in: [packages/artifacts/src/types.ts:708](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L708)

***

### schema

> **schema**: `"hardkas.silver.spendSimulation"`

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

### signatureScriptHex

> **signatureScriptHex**: `string`

Defined in: [packages/artifacts/src/types.ts:710](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L710)

***

### simulatedSpendTxId

> **simulatedSpendTxId**: `string`

Defined in: [packages/artifacts/src/types.ts:711](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L711)

***

### spendPlanHash

> **spendPlanHash**: `string`

Defined in: [packages/artifacts/src/types.ts:707](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L707)

***

### spentOutpoint

> **spentOutpoint**: `object`

Defined in: [packages/artifacts/src/types.ts:712](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L712)

#### index

> **index**: `number`

#### transactionId

> **transactionId**: `string`

***

### status

> **status**: `"SIMULATED_ACCEPTED"`

Defined in: [packages/artifacts/src/types.ts:722](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L722)

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
