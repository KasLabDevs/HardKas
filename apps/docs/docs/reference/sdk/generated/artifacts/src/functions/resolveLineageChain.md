[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / resolveLineageChain

# Function: resolveLineageChain()

> **resolveLineageChain**(`artifact`, `lookup?`, `maxHops?`): [`ResolvedLineageChain`](../interfaces/ResolvedLineageChain.md)

Defined in: [packages/artifacts/src/lineage-chain.ts:98](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/lineage-chain.ts#L98)

Walks the provenance chain of an artifact through the workspace store (see `ResolvedLineageChain`).

## Parameters

### artifact

`any`

### lookup?

[`ParentLookup`](../interfaces/ParentLookup.md) = `{}`

### maxHops?

`number` = `MAX_LINEAGE_HOPS`

## Returns

[`ResolvedLineageChain`](../interfaces/ResolvedLineageChain.md)
