[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ParentResolution

# Interface: ParentResolution

Defined in: [packages/artifacts/src/lineage-chain.ts:12](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/lineage-chain.ts#L12)

## Properties

### artifactId?

> `optional` **artifactId?**: `string`

Defined in: [packages/artifacts/src/lineage-chain.ts:19](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/lineage-chain.ts#L19)

The referenced parent identity (absent for a root).

***

### detail?

> `optional` **detail?**: `string`

Defined in: [packages/artifacts/src/lineage-chain.ts:21](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/lineage-chain.ts#L21)

Why it is invalid or unresolved.

***

### status

> **status**: [`ParentStatus`](../type-aliases/ParentStatus.md)

Defined in: [packages/artifacts/src/lineage-chain.ts:17](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/lineage-chain.ts#L17)

resolved: a copy that verifies as the referenced identity · missing: searched, not there · invalid: a copy there does
not verify as that identity · unresolved: nowhere was searched (no workspace root, no resolver) · root: no parent.
