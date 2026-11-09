[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / reconstructCovenantLineage

# Function: reconstructCovenantLineage()

> **reconstructCovenantLineage**(`covenantId`, `txs`): [`CovenantLineageSkeleton`](../interfaces/CovenantLineageSkeleton.md)

Defined in: [packages/sdk/src/covenant-lineage.ts:279](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/covenant-lineage.ts#L279)

The lineage of a covenant from its recorded transactions: the genesis anchored by its recomputed covenant id, the
transitions linked by the outpoints they spend, the node's final rejections set apart, the tip (outputs nothing
recorded spends), and every gap, conflict or unverifiable point as a finding. Pure: no node, no keys.

## Parameters

### covenantId

`string`

### txs

readonly [`CovenantLineageTx`](../interfaces/CovenantLineageTx.md)[]

## Returns

[`CovenantLineageSkeleton`](../interfaces/CovenantLineageSkeleton.md)
