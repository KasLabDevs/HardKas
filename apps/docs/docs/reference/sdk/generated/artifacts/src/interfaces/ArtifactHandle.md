[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ArtifactHandle

# Interface: ArtifactHandle

Defined in: [packages/artifacts/src/artifact-handle.ts:45](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/artifact-handle.ts#L45)

## Properties

### artifact

> `readonly` **artifact**: `any`

Defined in: [packages/artifacts/src/artifact-handle.ts:49](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/artifact-handle.ts#L49)

Parsed artifact JSON.

***

### artifactId

> `readonly` **artifactId**: `string`

Defined in: [packages/artifacts/src/artifact-handle.ts:51](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/artifact-handle.ts#L51)

Canonical artifactId: the hash recomputed under the declared version.

***

### authScope

> `readonly` **authScope**: [`AuthScope`](../type-aliases/AuthScope.md)

Defined in: [packages/artifacts/src/artifact-handle.ts:53](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/artifact-handle.ts#L53)

What that hash authenticated (FULL for the current version, LEGACY for v1–v4).

***

### copies

> `readonly` **copies**: readonly `string`[]

Defined in: [packages/artifacts/src/artifact-handle.ts:58](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/artifact-handle.ts#L58)

Every identical copy found in the workspace (the first is `path`).

***

### namespace

> `readonly` **namespace**: [`LookupNamespace`](../type-aliases/LookupNamespace.md)

Defined in: [packages/artifacts/src/artifact-handle.ts:56](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/artifact-handle.ts#L56)

***

### path

> `readonly` **path**: `string`

Defined in: [packages/artifacts/src/artifact-handle.ts:47](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/artifact-handle.ts#L47)

Resolved absolute filesystem path to the artifact file.

***

### resolvedBy

> `readonly` **resolvedBy**: `"artifactId"` \| `"path"` \| `"workflowId"` \| `"txId"` \| `"label"`

Defined in: [packages/artifacts/src/artifact-handle.ts:55](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/artifact-handle.ts#L55)

Which input form resolved the handle.
