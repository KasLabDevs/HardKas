[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasArtifactsManager

# Class: HardkasArtifactsManager

Defined in: [packages/sdk/src/artifacts-manager.ts:58](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/artifacts-manager.ts#L58)

Deterministic Artifact I/O boundary.

## Constructors

### Constructor

> **new HardkasArtifactsManager**(`sdk`): `HardkasArtifactsManager`

Defined in: [packages/sdk/src/artifacts-manager.ts:68](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/artifacts-manager.ts#L68)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasArtifactsManager`

## Methods

### cacheArtifact()

> **cacheArtifact**(`artifact`): `void`

Defined in: [packages/sdk/src/artifacts-manager.ts:106](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/artifacts-manager.ts#L106)

Memoises an artifact that exists in the store, under its recomputed identity.
The artifact must hash to the identity it declares; labels and txIds are never keys.

#### Parameters

##### artifact

`any`

#### Returns

`void`

***

### get()

> **get**(`input`, `options?`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/artifacts-manager.ts:318](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/artifacts-manager.ts#L318)

Alias for read().

#### Parameters

##### input

`ArtifactLookup`

##### options?

###### expectedSchema?

`string`

#### Returns

`Promise`\<`any`\>

***

### getCached()

> **getCached**(`artifactId`): `any`

Defined in: [packages/sdk/src/artifacts-manager.ts:253](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/artifacts-manager.ts#L253)

Retrieves a memoised artifact by its 64-hex artifactId. Labels and txIds are
never cache keys (IC-5′.8).

#### Parameters

##### artifactId

`string`

#### Returns

`any`

***

### list()

> **list**(): `Promise`\<`any`[]\>

Defined in: [packages/sdk/src/artifacts-manager.ts:345](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/artifacts-manager.ts#L345)

Lists all artifacts in the workspace.

#### Returns

`Promise`\<`any`[]\>

***

### migrate()

> **migrate**(`target`, `options?`): `Promise`\<\{ `legacyClaims`: `any`; `migrated`: `any`; `migratedPath?`: `string`; `receipt`: `any`; `receiptPath?`: `string`; `sourceArtifactId`: `string`; `sourcePath?`: `string`; `stripped`: `string`[]; \}\>

Defined in: [packages/sdk/src/artifacts-manager.ts:516](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/artifacts-manager.ts#L516)

Re-issues a legacy (hashVersion ≤ 4) artifact as a version-5 artifact plus
a MigrationReceipt (Closure Pack D-Q1.f / IC-4′.7). The source is verified
under the version it declares and is never rewritten; material fields it
never authenticated are carried only as `legacyClaims`. Both new artifacts
are written to the workspace store.

#### Parameters

##### target

`Record`\<`string`, `unknown`\> \| `ArtifactLookup`

##### options?

`string` \| \{ `migrationId?`: `string`; `to?`: `number`; \}

#### Returns

`Promise`\<\{ `legacyClaims`: `any`; `migrated`: `any`; `migratedPath?`: `string`; `receipt`: `any`; `receiptPath?`: `string`; `sourceArtifactId`: `string`; `sourcePath?`: `string`; `stripped`: `string`[]; \}\>

***

### noteStored()

> **noteStored**(`artifactId`): `void`

Defined in: [packages/sdk/src/artifacts-manager.ts:97](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/artifacts-manager.ts#L97)

An identity this instance just put in the store by another path than write() (e.g. a simulated execution commit).

#### Parameters

##### artifactId

`unknown`

#### Returns

`void`

***

### read()

> **read**(`input`, `options?`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/artifacts-manager.ts:271](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/artifacts-manager.ts#L271)

Reads an artifact from the workspace store (Wave 1.2 · IC-5′ / Q3-II).

- `read(string)`: a contained workspace path or a 64-hex artifactId. A label,
  txId or workflowId is refused with `NAMESPACE_REQUIRED` (the error names the
  exact replacement); there is no auto-detection and no fallback chain.
- `read({ artifact })`, `read({ plan })`, `read({ signed })`, `read({ tx })`
  (submissions only, never the signed), `read({ workflow })`.

Every returned artifact was verified (declared hash version, claimed identity,
derived label) before it was returned; ≥2 distinct candidates are an error.

#### Parameters

##### input

`ArtifactLookup`

##### options?

###### expectedSchema?

`string`

#### Returns

`Promise`\<`any`\>

***

### record()

> **record**(): `object`

Defined in: [packages/sdk/src/artifacts-manager.ts:79](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/artifacts-manager.ts#L79)

TASK-EVIDENCE-UNBOUND-1: records the identities of the artifacts THIS instance puts in (or finds already in, a
write-once hit) the workspace store until `stop()`, in write order. Scoped to the instance, never to the process
or the workspace: another instance writing at the same time (another task, another run) is not recorded. Writes
outside the store (`outputDir` exports) and dry runs are not recorded.
One recording at a time per instance: an instance cannot tell which of two overlapping runs made a write, so a
second recording while one is open is refused (ARTIFACT_RECORDING_BUSY) instead of crossing their evidence. Runs
that must overlap use one instance each.

#### Returns

`object`

##### stop()

> **stop**(): `string`[]

###### Returns

`string`[]

***

### verify()

> **verify**(`target`, `options?`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/artifacts-manager.ts:371](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/artifacts-manager.ts#L371)

Cryptographically verifies the determinism and integrity of an artifact.
Throws an error with details if corruption or mismatch is found.

#### Parameters

##### target

`any`

##### options?

###### enforceMetadata?

`boolean`

###### parent?

`any`

An in-memory parent, used only if it IS the artifact's `lineage.parentArtifactId` (identity-checked).

###### strict?

`boolean`

###### throwOnInvalid?

`boolean`

#### Returns

`Promise`\<`any`\>

***

### write()

> **write**(`artifact`, `options?`): `Promise`\<`WriteArtifactResult`\>

Defined in: [packages/sdk/src/artifacts-manager.ts:120](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/artifacts-manager.ts#L120)

Writes a valid artifact to disk (canonical or custom path).

#### Parameters

##### artifact

`HardkasArtifactBase`

##### options?

`WriteArtifactOptions` = `{}`

#### Returns

`Promise`\<`WriteArtifactResult`\>
