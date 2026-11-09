[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / createLineageTransition

# Function: createLineageTransition()

> **createLineageTransition**(`parent`, `_childType`): `object`

Defined in: [packages/artifacts/src/lineage.ts:232](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/lineage.ts#L232)

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
