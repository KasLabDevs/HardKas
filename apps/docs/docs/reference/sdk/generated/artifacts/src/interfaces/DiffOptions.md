[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / DiffOptions

# Interface: DiffOptions

Defined in: [packages/artifacts/src/diff.ts:18](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/diff.ts#L18)

## Properties

### exclude?

> `optional` **exclude?**: `object`

Defined in: [packages/artifacts/src/diff.ts:24](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/diff.ts#L24)

REPLAY-TRUST-2 · which keys are not compared. Without it: the frozen legacy SEMANTIC_EXCLUSIONS, dropped by name at
any depth (the historical behaviour, unchanged). With `topLevel`: everything is compared raw at every depth except
those top-level keys; no name is dropped below the top level.

#### topLevel

> **topLevel**: readonly `string`[]
