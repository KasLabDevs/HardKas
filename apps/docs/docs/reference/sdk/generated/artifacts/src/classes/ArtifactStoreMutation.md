[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ArtifactStoreMutation

# Class: ArtifactStoreMutation

Defined in: [packages/artifacts/src/store-mutation.ts:12](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store-mutation.ts#L12)

ARTIFACT-MUTATION-1: every mutation of `<workspace>/.hardkas/artifacts/**` made by cooperative HardKAS code goes
through this gate and happens under the workspace's `artifacts` lock, taken reentrantly (writes made inside a unit
held with `hold` join its holding). This module is the only code that touches the store's files and directories
physically; packages/artifacts/test/artifact-mutation-guard.test.ts keeps it that way.

## Constructors

### Constructor

> **new ArtifactStoreMutation**(`workspaceRoot`): `ArtifactStoreMutation`

Defined in: [packages/artifacts/src/store-mutation.ts:18](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store-mutation.ts#L18)

#### Parameters

##### workspaceRoot

`string`

#### Returns

`ArtifactStoreMutation`

## Properties

### storeDir

> `readonly` **storeDir**: `string`

Defined in: [packages/artifacts/src/store-mutation.ts:16](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store-mutation.ts#L16)

`<workspace>/.hardkas/artifacts`.

***

### workspaceRoot

> `readonly` **workspaceRoot**: `string`

Defined in: [packages/artifacts/src/store-mutation.ts:14](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store-mutation.ts#L14)

The workspace whose store this is; its `artifacts` lock lives in `<workspace>/.hardkas/locks`.

## Methods

### ensureDir()

> **ensureDir**(`relDir?`): `Promise`\<`string`\>

Defined in: [packages/artifacts/src/store-mutation.ts:57](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store-mutation.ts#L57)

Creates a directory of the store (the store itself by default).

#### Parameters

##### relDir?

`string` = `""`

#### Returns

`Promise`\<`string`\>

***

### hold()

> **hold**\<`T`\>(`fn`, `command?`): `Promise`\<`T`\>

Defined in: [packages/artifacts/src/store-mutation.ts:71](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store-mutation.ts#L71)

Runs fn as one unit of the store: inside a single holding of `artifacts`, which the gate's writes made from fn join.
No other cooperative writer or reader of the store can come in between fn's reads and writes.

#### Type Parameters

##### T

`T`

#### Parameters

##### fn

() => `Promise`\<`T`\>

##### command?

`string` = `"artifact store unit"`

#### Returns

`Promise`\<`T`\>

***

### writeFile()

> **writeFile**(`relPath`, `data`, `options?`): `Promise`\<`string`\>

Defined in: [packages/artifacts/src/store-mutation.ts:40](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store-mutation.ts#L40)

Writes a file of the store: an atomic replace by default; with `exclusive`, it is created only if absent and an
existing file is never overwritten (EEXIST). `mode` sets the file permissions, as the plain writers did.

#### Parameters

##### relPath

`string`

##### data

`string` \| `Uint8Array`\<`ArrayBufferLike`\>

##### options?

###### exclusive?

`boolean`

###### mode?

`number`

#### Returns

`Promise`\<`string`\>

***

### forPath()

> `static` **forPath**(`filePath`): `object`

Defined in: [packages/artifacts/src/store-mutation.ts:24](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/store-mutation.ts#L24)

The store a path is in (or is), with the path relative to it; undefined outside any artifact store.

#### Parameters

##### filePath

`string`

#### Returns

`object`

##### relPath

> **relPath**: `string`

##### store

> **store**: `ArtifactStoreMutation`
