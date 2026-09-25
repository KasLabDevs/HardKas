[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / withLocks

# Function: withLocks()

> **withLocks**\<`T`\>(`rootDir`, `names`, `fn`, `options?`): `Promise`\<`T`\>

Defined in: [packages/core/src/lock.ts:234](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/lock.ts#L234)

Helper to run a task with multiple locks in deterministic order.

## Type Parameters

### T

`T`

## Parameters

### rootDir

`string`

### names

`string`[]

### fn

() => `Promise`\<`T`\>

### options?

#### command?

`string`

#### timeoutMs?

`number`

#### wait?

`boolean`

## Returns

`Promise`\<`T`\>
