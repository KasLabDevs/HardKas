[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / systemRuntimeContext

# Variable: systemRuntimeContext

> `const` **systemRuntimeContext**: [`RuntimeContext`](../interfaces/RuntimeContext.md)

Defined in: [packages/core/src/runtime-context.ts:43](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/runtime-context.ts#L43)

A default system runtime context (for non-deterministic contexts like dev server or CLI entry points)
This should NOT be used directly in pure canonical domain logic (e.g. artifacts, replays).
