[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / createLineageTransition

# Function: createLineageTransition()

> **createLineageTransition**(`parent`, `_childType`): `object`

Defined in: [packages/artifacts/src/lineage.ts:198](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/lineage.ts#L198)

Creates a valid lineage transition object for a new child artifact based on its parent.
This should be attached to the child artifact before calculating its final hash.

## Parameters

### parent

`any`

### \_childType

`string`

## Returns

`object`

### artifactId

> **artifactId**: `string`

### lineageId

> **lineageId**: `string`

### parentArtifactId

> **parentArtifactId**: `string`

### rootArtifactId

> **rootArtifactId**: `string`

### sequence

> **sequence**: `number`
