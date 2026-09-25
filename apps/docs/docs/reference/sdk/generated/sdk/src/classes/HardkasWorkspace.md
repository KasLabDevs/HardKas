[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasWorkspace

# Class: HardkasWorkspace

Defined in: [packages/sdk/src/workspace.ts:9](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/workspace.ts#L9)

Deterministic Workspace Abstraction.
Encapsulates all filesystem boundary interactions and isolates paths
from the global process.cwd(), ensuring agent/script replayability.

## Constructors

### Constructor

> **new HardkasWorkspace**(`cwd`, `overrideHardkasDir?`): `HardkasWorkspace`

Defined in: [packages/sdk/src/workspace.ts:13](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/workspace.ts#L13)

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

Defined in: [packages/sdk/src/workspace.ts:10](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/workspace.ts#L10)

## Accessors

### artifactsDir

#### Get Signature

> **get** **artifactsDir**(): `string`

Defined in: [packages/sdk/src/workspace.ts:25](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/workspace.ts#L25)

##### Returns

`string`

***

### hardkasDir

#### Get Signature

> **get** **hardkasDir**(): `string`

Defined in: [packages/sdk/src/workspace.ts:21](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/workspace.ts#L21)

##### Returns

`string`

***

### keystoreDir

#### Get Signature

> **get** **keystoreDir**(): `string`

Defined in: [packages/sdk/src/workspace.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/workspace.ts#L33)

##### Returns

`string`

***

### localnetStatePath

#### Get Signature

> **get** **localnetStatePath**(): `string`

Defined in: [packages/sdk/src/workspace.ts:29](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/workspace.ts#L29)

##### Returns

`string`

## Methods

### ensureHardkasDir()

> **ensureHardkasDir**(): `void`

Defined in: [packages/sdk/src/workspace.ts:54](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/workspace.ts#L54)

Ensures the core .hardkas directory exists.

#### Returns

`void`

***

### relativeFromRoot()

> **relativeFromRoot**(`absolutePath`): `string`

Defined in: [packages/sdk/src/workspace.ts:47](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/workspace.ts#L47)

Safely builds a relative path from the workspace root to the target.

#### Parameters

##### absolutePath

`string`

#### Returns

`string`

***

### resolvePath()

> **resolvePath**(...`segments`): `string`

Defined in: [packages/sdk/src/workspace.ts:40](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/workspace.ts#L40)

Safely resolves a path relative to the workspace root.

#### Parameters

##### segments

...`string`[]

#### Returns

`string`
