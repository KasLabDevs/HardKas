[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / acquireLock

# Function: acquireLock()

> **acquireLock**(`args`): `Promise`\<[`LockHandle`](../interfaces/LockHandle.md)\>

Defined in: [packages/core/src/lock.ts:56](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/lock.ts#L56)

Acquires a named lock for the workspace.
Supports automatic stale lock recovery when the holding process is dead.

## Parameters

### args

[`AcquireLockArgs`](../interfaces/AcquireLockArgs.md)

## Returns

`Promise`\<[`LockHandle`](../interfaces/LockHandle.md)\>
