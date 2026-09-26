[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ArtifactHandle

# Interface: ArtifactHandle

Defined in: [packages/artifacts/src/artifact-handle.ts:54](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/artifact-handle.ts#L54)

## Properties

### artifact

> `readonly` **artifact**: `any`

Defined in: [packages/artifacts/src/artifact-handle.ts:58](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/artifact-handle.ts#L58)

Parsed artifact JSON.

***

### artifactId?

> `readonly` `optional` **artifactId?**: `string`

Defined in: [packages/artifacts/src/artifact-handle.ts:60](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/artifact-handle.ts#L60)

Canonical artifactId from artifact.lineage.artifactId when present.

***

### path

> `readonly` **path**: `string`

Defined in: [packages/artifacts/src/artifact-handle.ts:56](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/artifact-handle.ts#L56)

Resolved absolute filesystem path to the artifact file.

***

### resolvedBy

> `readonly` **resolvedBy**: `"artifactId"` \| `"path"`

Defined in: [packages/artifacts/src/artifact-handle.ts:62](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/artifact-handle.ts#L62)

Which input form resolved the handle.
