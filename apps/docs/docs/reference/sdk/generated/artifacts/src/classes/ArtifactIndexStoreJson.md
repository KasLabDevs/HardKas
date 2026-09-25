[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ArtifactIndexStoreJson

# Class: ArtifactIndexStoreJson

Defined in: [packages/artifacts/src/artifact-index.ts:23](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/artifact-index.ts#L23)

## Constructors

### Constructor

> **new ArtifactIndexStoreJson**(`options?`): `ArtifactIndexStoreJson`

Defined in: [packages/artifacts/src/artifact-index.ts:26](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/artifact-index.ts#L26)

#### Parameters

##### options?

[`ArtifactIndexOptions`](../interfaces/ArtifactIndexOptions.md)

#### Returns

`ArtifactIndexStoreJson`

## Methods

### find()

> **find**(`query`): [`ArtifactEntry`](../interfaces/ArtifactEntry.md)[]

Defined in: [packages/artifacts/src/artifact-index.ts:65](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/artifact-index.ts#L65)

#### Parameters

##### query

[`ArtifactIndexQuery`](../interfaces/ArtifactIndexQuery.md)

#### Returns

[`ArtifactEntry`](../interfaces/ArtifactEntry.md)[]

***

### get()

> **get**(`hash`): [`ArtifactEntry`](../interfaces/ArtifactEntry.md)

Defined in: [packages/artifacts/src/artifact-index.ts:57](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/artifact-index.ts#L57)

#### Parameters

##### hash

`string`

#### Returns

[`ArtifactEntry`](../interfaces/ArtifactEntry.md)

***

### getAll()

> **getAll**(): `Record`\<`string`, [`ArtifactEntry`](../interfaces/ArtifactEntry.md)\>

Defined in: [packages/artifacts/src/artifact-index.ts:37](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/artifact-index.ts#L37)

#### Returns

`Record`\<`string`, [`ArtifactEntry`](../interfaces/ArtifactEntry.md)\>

***

### index()

> **index**(`artifact`): `void`

Defined in: [packages/artifacts/src/artifact-index.ts:51](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/artifact-index.ts#L51)

#### Parameters

##### artifact

[`ArtifactEntry`](../interfaces/ArtifactEntry.md)

#### Returns

`void`

***

### list()

> **list**(): [`ArtifactEntry`](../interfaces/ArtifactEntry.md)[]

Defined in: [packages/artifacts/src/artifact-index.ts:61](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/artifact-index.ts#L61)

#### Returns

[`ArtifactEntry`](../interfaces/ArtifactEntry.md)[]

***

### setAll()

> **setAll**(`data`): `void`

Defined in: [packages/artifacts/src/artifact-index.ts:46](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/artifact-index.ts#L46)

#### Parameters

##### data

`Record`\<`string`, [`ArtifactEntry`](../interfaces/ArtifactEntry.md)\>

#### Returns

`void`
