[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / diffArtifacts

# Function: diffArtifacts()

> **diffArtifacts**(`left`, `right`): [`ArtifactDiff`](../interfaces/ArtifactDiff.md)

Defined in: [packages/artifacts/src/diff.ts:21](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/diff.ts#L21)

Performs a semantic diff between two artifacts, ignoring volatile metadata.
Uses the same exclusion rules as canonical hashing.
Redacts secrets from the output.

## Parameters

### left

`any`

### right

`any`

## Returns

[`ArtifactDiff`](../interfaces/ArtifactDiff.md)
