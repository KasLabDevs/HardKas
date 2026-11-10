[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / parentReferenceOf

# Function: parentReferenceOf()

> **parentReferenceOf**(`artifact`): `string`

Defined in: [packages/artifacts/src/lineage-chain.ts:36](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/lineage-chain.ts#L36)

The parent an artifact references: only the authenticated `lineage.parentArtifactId` (an empty one is an explicit
root), or — for artifacts written before the lineage block — a top-level 64-hex `parentArtifactId`. Labels
(`sourcePlanId`, `sourceSignedId`) never resolve a reference.

## Parameters

### artifact

`any`

## Returns

`string`
