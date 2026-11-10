[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ExplainContext

# Interface: ExplainContext

Defined in: [packages/artifacts/src/explain.ts:14](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/explain.ts#L14)

Where `explainArtifact` may look for what the artifact references (EVIDENCE-TRUST-1): the workspace whose store is
searched, and/or a resolver. Without either, a parent is reported "unresolved", never "missing".

## Properties

### resolveArtifact?

> `optional` **resolveArtifact?**: (`artifactId`) => `any`

Defined in: [packages/artifacts/src/explain.ts:16](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/explain.ts#L16)

#### Parameters

##### artifactId

`string`

#### Returns

`any`

***

### workspaceRoot?

> `optional` **workspaceRoot?**: `string`

Defined in: [packages/artifacts/src/explain.ts:15](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/explain.ts#L15)
