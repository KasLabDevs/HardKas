[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / TaskDefinition

# Interface: TaskDefinition\<Args, Hk\>

Defined in: [packages/core/src/tasks.ts:19](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/tasks.ts#L19)

## Type Parameters

### Args

`Args` = `any`

### Hk

`Hk` = `any`

## Properties

### actionFn?

> `optional` **actionFn?**: `TaskAction`\<`Args`, `Hk`\>

Defined in: [packages/core/src/tasks.ts:23](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/tasks.ts#L23)

***

### description

> **description**: `string`

Defined in: [packages/core/src/tasks.ts:21](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/tasks.ts#L21)

***

### name

> **name**: `string`

Defined in: [packages/core/src/tasks.ts:20](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/tasks.ts#L20)

***

### params

> **params**: `Record`\<`string`, `TaskParam`\>

Defined in: [packages/core/src/tasks.ts:22](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/tasks.ts#L22)

## Methods

### action()

> **action**(`fn`): `this`

Defined in: [packages/core/src/tasks.ts:26](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/tasks.ts#L26)

#### Parameters

##### fn

`TaskAction`\<`Args`, `Hk`\>

#### Returns

`this`

***

### param()

> **param**(`name`, `description`, `type?`, `defaultValue?`): `this`

Defined in: [packages/core/src/tasks.ts:25](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/tasks.ts#L25)

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
