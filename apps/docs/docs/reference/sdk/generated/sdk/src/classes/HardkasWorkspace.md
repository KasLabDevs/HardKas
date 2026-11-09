[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasWorkspace

# Class: HardkasWorkspace

Defined in: [packages/sdk/src/workspace.ts:11](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/workspace.ts#L11)

Deterministic Workspace Abstraction.
Encapsulates all filesystem boundary interactions and isolates paths
from the global process.cwd(), ensuring agent/script replayability.

## Constructors

### Constructor

> **new HardkasWorkspace**(`cwd`, `overrideHardkasDir?`): `HardkasWorkspace`

Defined in: [packages/sdk/src/workspace.ts:15](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/workspace.ts#L15)

#### Parameters

##### cwd

`string`

##### overrideHardkasDir?

`string`

#### Returns

`HardkasWorkspace`

## Properties

### root

> `readonly` **root**: `string`

Defined in: [packages/sdk/src/workspace.ts:12](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/workspace.ts#L12)

## Accessors

### artifactsDir

#### Get Signature

> **get** **artifactsDir**(): `string`

Defined in: [packages/sdk/src/workspace.ts:27](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/workspace.ts#L27)

##### Returns

`string`

***

### hardkasDir

#### Get Signature

> **get** **hardkasDir**(): `string`

Defined in: [packages/sdk/src/workspace.ts:23](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/workspace.ts#L23)

##### Returns

`string`

***

### keystoreDir

#### Get Signature

> **get** **keystoreDir**(): `string`

Defined in: [packages/sdk/src/workspace.ts:35](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/workspace.ts#L35)

##### Returns

`string`

***

### localnetStatePath

#### Get Signature

> **get** **localnetStatePath**(): `string`

Defined in: [packages/sdk/src/workspace.ts:31](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/workspace.ts#L31)

##### Returns

`string`

## Methods

### ensureHardkasDir()

> **ensureHardkasDir**(): `void`

Defined in: [packages/sdk/src/workspace.ts:83](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/workspace.ts#L83)

Ensures the core .hardkas directory exists.

#### Returns

`void`

***

### keystorePath()

> **keystorePath**(`name`): `string`

Defined in: [packages/sdk/src/workspace.ts:45](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/workspace.ts#L45)

CONTAINMENT-2 (R1-I1): the keystore file of account `name`, decided before anything is read or written: `name` is
a valid account name and its keystore is ONE plain file directly in keystoreDir (which honours a configured
hardkasDir). An existing entry there that is not a plain file (a link or a directory) is refused too, so nothing
is ever read or replaced through it. Refusals are ACCOUNT_NAME_INVALID.

#### Parameters

##### name

`unknown`

#### Returns

`string`

***

### relativeFromRoot()

> **relativeFromRoot**(`absolutePath`): `string`

Defined in: [packages/sdk/src/workspace.ts:76](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/workspace.ts#L76)

Safely builds a relative path from the workspace root to the target.

#### Parameters

##### absolutePath

`string`

#### Returns

`string`

***

### resolvePath()

> **resolvePath**(...`segments`): `string`

Defined in: [packages/sdk/src/workspace.ts:69](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/workspace.ts#L69)

Safely resolves a path relative to the workspace root.

#### Parameters

##### segments

...`string`[]

#### Returns

`string`
