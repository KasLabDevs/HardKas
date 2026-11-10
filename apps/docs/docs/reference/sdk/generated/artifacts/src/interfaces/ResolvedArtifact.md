[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ResolvedArtifact

# Interface: ResolvedArtifact

Defined in: [packages/artifacts/src/resolve.ts:76](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/resolve.ts#L76)

## Properties

### artifact

> **artifact**: `any`

Defined in: [packages/artifacts/src/resolve.ts:78](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/resolve.ts#L78)

Parsed artifact (the file's content, unmodified).

***

### artifactId

> **artifactId**: `string`

Defined in: [packages/artifacts/src/resolve.ts:80](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/resolve.ts#L80)

Canonical identity: the hash recomputed under the declared version.

***

### authScope

> **authScope**: [`AuthScope`](../type-aliases/AuthScope.md)

Defined in: [packages/artifacts/src/resolve.ts:84](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/resolve.ts#L84)

What the declared hash version authenticated (D-Q1.e).

***

### copies

> **copies**: `string`[]

Defined in: [packages/artifacts/src/resolve.ts:88](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/resolve.ts#L88)

Every identical copy found (same identity), the first is `path`.

***

### namespace

> **namespace**: [`LookupNamespace`](../type-aliases/LookupNamespace.md)

Defined in: [packages/artifacts/src/resolve.ts:85](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/resolve.ts#L85)

***

### path

> **path**: `string`

Defined in: [packages/artifacts/src/resolve.ts:82](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/resolve.ts#L82)

Absolute path of the returned copy.

***

### resolvedBy

> **resolvedBy**: `"artifactId"` \| `"path"` \| `"workflowId"` \| `"txId"` \| `"label"`

Defined in: [packages/artifacts/src/resolve.ts:86](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/resolve.ts#L86)
