[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ProjectArtifactStore

# Class: ProjectArtifactStore

Defined in: [packages/artifacts/src/store.ts:84](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store.ts#L84)

## Constructors

### Constructor

> **new ProjectArtifactStore**(`workspaceRoot`): `ProjectArtifactStore`

Defined in: [packages/artifacts/src/store.ts:88](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store.ts#L88)

#### Parameters

##### workspaceRoot

`string`

#### Returns

`ProjectArtifactStore`

## Methods

### enumerateCanonicalArtifacts()

> **enumerateCanonicalArtifacts**(): `Promise`\<`object`[]\>

Defined in: [packages/artifacts/src/store.ts:456](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store.ts#L456)

#### Returns

`Promise`\<`object`[]\>

***

### exists()

> **exists**(`id`): `Promise`\<`boolean`\>

Defined in: [packages/artifacts/src/store.ts:190](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store.ts#L190)

True when `id` (a contained path or a 64-hex artifactId) resolves to a verified
artifact. A label needs its namespace and is refused (NAMESPACE_REQUIRED).

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`boolean`\>

***

### findReceiptByTxId()

> **findReceiptByTxId**(`txId`): `Promise`\<`unknown`\>

Defined in: [packages/artifacts/src/store.ts:299](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store.ts#L299)

#### Parameters

##### txId

`string`

#### Returns

`Promise`\<`unknown`\>

***

### listObservationsByTxId()

> **listObservationsByTxId**(`txId`): `object`

Defined in: [packages/artifacts/src/store.ts:268](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store.ts#L268)

Wave 2(a) · IC-2′.6: the observations recorded for `txId` — N by design. Every
candidate is verified (strict, FULL) before it counts; the rest are reported,
never silently dropped and never used to decide (IC-2′.8).

#### Parameters

##### txId

`string`

#### Returns

`object`

##### observations

> **observations**: `unknown`[]

##### rejected

> **rejected**: `object`[]

***

### publishArtifact()

> **publishArtifact**(`artifact`): `Promise`\<[`PublishedArtifact`](../interfaces/PublishedArtifact.md)\>

Defined in: [packages/artifacts/src/store.ts:122](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store.ts#L122)

EVIDENCE-TRUST-1 (ET-C1): a published evidence identity is write-once.
- No entry for the identity → the artifact is written (atomically, through the store's gate).
- The entry holds a copy that verifies as this same identity → it is kept byte for byte and returned: the durable
  copy is the authority for the fields outside the identity (createdAt, hardkasVersion, …), as for state snapshots.
- Anything else (not JSON, a copy that does not verify — tampered —, another identity, or other bytes for an
  artifact without contentHash) → ARTIFACT_IDENTITY_CONFLICT, and not a byte is touched: a second write never
  "repairs" evidence that was changed.
The check and the write happen in one holding of the store, so no cooperative writer comes in between.

#### Parameters

##### artifact

`any`

#### Returns

`Promise`\<[`PublishedArtifact`](../interfaces/PublishedArtifact.md)\>

***

### queryArtifacts()

> **queryArtifacts**(`query`): `Promise`\<`any`[]\>

Defined in: [packages/artifacts/src/store.ts:488](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store.ts#L488)

#### Parameters

##### query

###### schema?

`string`

#### Returns

`Promise`\<`any`[]\>

***

### readArtifact()

> **readArtifact**(`id`): `Promise`\<`unknown`\>

Defined in: [packages/artifacts/src/store.ts:211](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store.ts#L211)

Wave 1.2 · IC-5′: reads a contained workspace path or a 64-hex artifactId
(the recomputed contentHash). Both are verified before they are returned.
Labels (`planId`, `signedId`), txIds and workflowIds are refused with
NAMESPACE_REQUIRED: use `resolveArtifact(root, { plan | signed | tx | workflow })`.

Paths are relative to the WORKSPACE ROOT (never process.cwd(), IC-5′.7) and
are checked against the boundary whether or not they exist, so a traversal
attempt is reported as such (PATH_TRAVERSAL) instead of as a missing artifact.

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`unknown`\>

***

### resolveLineage()

> **resolveLineage**(`id`): `Promise`\<`any`[]\>

Defined in: [packages/artifacts/src/store.ts:392](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store.ts#L392)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`any`[]\>

***

### writeArtifact()

> **writeArtifact**(`artifact`): `Promise`\<`string`\>

Defined in: [packages/artifacts/src/store.ts:108](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store.ts#L108)

Publishes an artifact (see `publishArtifact`) and returns the path of its store entry.

#### Parameters

##### artifact

`any`

#### Returns

`Promise`\<`string`\>
