[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasArtifactsManager

# Class: HardkasArtifactsManager

Defined in: [packages/sdk/src/artifacts-manager.ts:48](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/artifacts-manager.ts#L48)

Deterministic Artifact I/O boundary.

## Constructors

### Constructor

> **new HardkasArtifactsManager**(`sdk`): `HardkasArtifactsManager`

Defined in: [packages/sdk/src/artifacts-manager.ts:51](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/artifacts-manager.ts#L51)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasArtifactsManager`

## Methods

### cacheArtifact()

> **cacheArtifact**(`artifact`): `void`

Defined in: [packages/sdk/src/artifacts-manager.ts:56](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/artifacts-manager.ts#L56)

Caches an in-memory artifact.

#### Parameters

##### artifact

`any`

#### Returns

`void`

***

### get()

> **get**(`id`, `options?`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/artifacts-manager.ts:213](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/artifacts-manager.ts#L213)

Alias for read().

#### Parameters

##### id

`string`

##### options?

###### expectedSchema?

`string`

#### Returns

`Promise`\<`any`\>

***

### getCached()

> **getCached**(`id`): `any`

Defined in: [packages/sdk/src/artifacts-manager.ts:182](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/artifacts-manager.ts#L182)

Retrieves an artifact from the in-memory cache.

#### Parameters

##### id

`string`

#### Returns

`any`

***

### list()

> **list**(): `Promise`\<`any`[]\>

Defined in: [packages/sdk/src/artifacts-manager.ts:220](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/artifacts-manager.ts#L220)

Lists all artifacts in the workspace.

#### Returns

`Promise`\<`any`[]\>

***

### migrate()

> **migrate**(`target`, `migrationId`): `Promise`\<\{ `migrated`: `any`; `receipt`: `any`; \}\>

Defined in: [packages/sdk/src/artifacts-manager.ts:354](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/artifacts-manager.ts#L354)

Migrates a legacy artifact to v4 using a migration receipt.

#### Parameters

##### target

`any`

##### migrationId

`string`

#### Returns

`Promise`\<\{ `migrated`: `any`; `receipt`: `any`; \}\>

***

### read()

> **read**(`id`, `options?`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/artifacts-manager.ts:189](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/artifacts-manager.ts#L189)

Reads an artifact by path or ID/hash from the workspace.

#### Parameters

##### id

`string`

##### options?

###### expectedSchema?

`string`

#### Returns

`Promise`\<`any`\>

***

### verify()

> **verify**(`target`, `options?`): `Promise`\<`any`\>

Defined in: [packages/sdk/src/artifacts-manager.ts:246](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/artifacts-manager.ts#L246)

Cryptographically verifies the determinism and integrity of an artifact.
Throws an error with details if corruption or mismatch is found.

#### Parameters

##### target

`any`

##### options?

###### enforceMetadata?

`boolean`

###### strict?

`boolean`

###### throwOnInvalid?

`boolean`

#### Returns

`Promise`\<`any`\>

***

### write()

> **write**(`artifact`, `options?`): `Promise`\<`WriteArtifactResult`\>

Defined in: [packages/sdk/src/artifacts-manager.ts:68](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/artifacts-manager.ts#L68)

Writes a valid artifact to disk (canonical or custom path).

#### Parameters

##### artifact

`HardkasArtifactBase`

##### options?

`WriteArtifactOptions` = `{}`

#### Returns

`Promise`\<`WriteArtifactResult`\>
