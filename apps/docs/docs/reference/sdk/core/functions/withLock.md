[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / withLock

# Function: withLock()

> **withLock**\<`T`\>(`args`, `fn`): `Promise`\<`T`\>

Defined in: [packages/core/src/lock.ts:219](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/lock.ts#L219)

Helper to run a task with a single lock.

## Type Parameters

### T

`T`

## Parameters

### args

[`AcquireLockArgs`](../interfaces/AcquireLockArgs.md)

### fn

(`handle`) => `Promise`\<`T`\>

## Returns

`Promise`\<`T`\>
