[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / TaskBuilder

# Class: TaskBuilder\<Args, Hk\>

Defined in: [packages/core/src/tasks.ts:29](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/tasks.ts#L29)

## Type Parameters

### Args

`Args` = `any`

### Hk

`Hk` = `any`

## Implements

- [`TaskDefinition`](../interfaces/TaskDefinition.md)\<`Args`, `Hk`\>

## Constructors

### Constructor

> **new TaskBuilder**\<`Args`, `Hk`\>(`name`, `description`): `TaskBuilder`\<`Args`, `Hk`\>

Defined in: [packages/core/src/tasks.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/tasks.ts#L33)

#### Parameters

##### name

`string`

##### description

`string`

#### Returns

`TaskBuilder`\<`Args`, `Hk`\>

## Properties

### actionFn?

> `optional` **actionFn?**: `TaskAction`\<`Args`, `Hk`\>

Defined in: [packages/core/src/tasks.ts:31](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/tasks.ts#L31)

#### Implementation of

[`TaskDefinition`](../interfaces/TaskDefinition.md).[`actionFn`](../interfaces/TaskDefinition.md#actionfn)

***

### description

> **description**: `string`

Defined in: [packages/core/src/tasks.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/tasks.ts#L33)

#### Implementation of

[`TaskDefinition`](../interfaces/TaskDefinition.md).[`description`](../interfaces/TaskDefinition.md#description)

***

### name

> **name**: `string`

Defined in: [packages/core/src/tasks.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/tasks.ts#L33)

#### Implementation of

[`TaskDefinition`](../interfaces/TaskDefinition.md).[`name`](../interfaces/TaskDefinition.md#name)

***

### params

> **params**: `Record`\<`string`, `TaskParam`\> = `{}`

Defined in: [packages/core/src/tasks.ts:30](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/tasks.ts#L30)

#### Implementation of

[`TaskDefinition`](../interfaces/TaskDefinition.md).[`params`](../interfaces/TaskDefinition.md#params)

## Methods

### action()

> **action**(`fn`): `this`

Defined in: [packages/core/src/tasks.ts:46](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/tasks.ts#L46)

#### Parameters

##### fn

`TaskAction`\<`Args`, `Hk`\>

#### Returns

`this`

#### Implementation of

[`TaskDefinition`](../interfaces/TaskDefinition.md).[`action`](../interfaces/TaskDefinition.md#action)

***

### param()

> **param**(`name`, `description`, `type?`, `defaultValue?`): `this`

Defined in: [packages/core/src/tasks.ts:35](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/tasks.ts#L35)

#### Parameters

##### name

`string`

##### description

`string`

##### type?

`"string"` \| `"number"` \| `"boolean"`

##### defaultValue?

`any`

#### Returns

`this`

#### Implementation of

[`TaskDefinition`](../interfaces/TaskDefinition.md).[`param`](../interfaces/TaskDefinition.md#param)
