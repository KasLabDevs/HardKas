[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / explainArtifact

# Function: explainArtifact()

> **explainArtifact**(`artifactUnknown`, `context?`): `Promise`\<[`ArtifactExplanation`](../interfaces/ArtifactExplanation.md)\>

Defined in: [packages/artifacts/src/explain.ts:61](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/explain.ts#L61)

Generates a deep operational explanation of a HardKAS artifact. With `context` the references are looked up there
(the workspace store, as `hardkas verify` does); without it nothing is searched and a parent is "unresolved".

## Parameters

### artifactUnknown

`unknown`

### context?

[`ExplainContext`](../interfaces/ExplainContext.md) = `{}`

## Returns

`Promise`\<[`ArtifactExplanation`](../interfaces/ArtifactExplanation.md)\>
