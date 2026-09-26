[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / LOCK\_ORDER

# Variable: LOCK\_ORDER

> `const` **LOCK\_ORDER**: `string`[]

Defined in: [packages/core/src/lock.ts:42](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/lock.ts#L42)

Deterministic lock ordering to avoid deadlocks.
workspace > node > accounts > artifacts > events > query-store
