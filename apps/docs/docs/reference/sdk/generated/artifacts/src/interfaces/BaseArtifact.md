[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / BaseArtifact

# Interface: BaseArtifact\<T\>

Defined in: [packages/artifacts/src/types.ts:32](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L32)

## Extended by

- [`TxPlanArtifactV2`](TxPlanArtifactV2.md)
- [`SignedTxArtifactV2`](SignedTxArtifactV2.md)
- [`TxReceiptArtifactV2`](TxReceiptArtifactV2.md)
- [`PolicyArtifact`](PolicyArtifact.md)
- [`NetworkProfileArtifact`](NetworkProfileArtifact.md)
- [`AssumptionArtifact`](AssumptionArtifact.md)
- [`MigrationReceiptArtifact`](MigrationReceiptArtifact.md)
- [`TxPlanArtifact`](TxPlanArtifact.md)
- [`SignedTxArtifact`](SignedTxArtifact.md)
- [`TxReceiptArtifact`](TxReceiptArtifact.md)
- [`SnapshotArtifact`](SnapshotArtifact.md)
- [`TxTraceArtifact`](TxTraceArtifact.md)
- [`WorkflowArtifact`](WorkflowArtifact.md)
- [`SilverCompileArtifact`](SilverCompileArtifact.md)
- [`SilverTestArtifact`](SilverTestArtifact.md)
- [`SilverDeployPlanArtifact`](SilverDeployPlanArtifact.md)
- [`SilverDeployArtifact`](SilverDeployArtifact.md)
- [`SilverSpendPlanArtifact`](SilverSpendPlanArtifact.md)
- [`SilverSpendReceiptArtifact`](SilverSpendReceiptArtifact.md)
- [`SilverDeploySimulationArtifact`](SilverDeploySimulationArtifact.md)
- [`SilverSpendSimulationArtifact`](SilverSpendSimulationArtifact.md)

## Type Parameters

### T

`T` *extends* [`ArtifactType`](../type-aliases/ArtifactType.md)

## Properties

### assumptionLevel?

> `optional` **assumptionLevel?**: [`AssumptionLevel`](../type-aliases/AssumptionLevel.md)

Defined in: [packages/artifacts/src/types.ts:44](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L44)

***

### contentHash?

> `optional` **contentHash?**: `ContentHash`

Defined in: [packages/artifacts/src/types.ts:42](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L42)

***

### createdAt

> **createdAt**: `string`

Defined in: [packages/artifacts/src/types.ts:40](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L40)

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

***

### executionMode?

> `optional` **executionMode?**: [`AnyExecutionMode`](../type-aliases/AnyExecutionMode.md)

Defined in: [packages/artifacts/src/types.ts:45](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L45)

***

### hardkasVersion

> **hardkasVersion**: `string`

Defined in: [packages/artifacts/src/types.ts:35](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L35)

***

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

Defined in: [packages/artifacts/src/types.ts:37](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L37)

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

***

### mode

> **mode**: [`AnyExecutionMode`](../type-aliases/AnyExecutionMode.md)

Defined in: [packages/artifacts/src/types.ts:39](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L39)

***

### networkId

> **networkId**: [`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

Defined in: [packages/artifacts/src/types.ts:38](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L38)

***

### schema

> **schema**: `` `hardkas.${T}` ``

Defined in: [packages/artifacts/src/types.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L33)

***

### schemaVersion?

> `optional` **schemaVersion?**: `string`

Defined in: [packages/artifacts/src/types.ts:34](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L34)

***

### version

> **version**: `string`

Defined in: [packages/artifacts/src/types.ts:36](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L36)

***

### workflowId?

> `optional` **workflowId?**: `WorkflowId`

Defined in: [packages/artifacts/src/types.ts:43](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L43)
