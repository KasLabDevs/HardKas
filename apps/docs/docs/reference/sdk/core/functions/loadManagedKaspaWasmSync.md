[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / loadManagedKaspaWasmSync

# Function: loadManagedKaspaWasmSync()

> **loadManagedKaspaWasmSync**(): `any`

Defined in: [packages/core/src/kaspa-wasm.ts:15](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/kaspa-wasm.ts#L15)

Loads the pinned official Kaspa WASM SDK from the managed toolchain directory.

Fails closed: a missing install or any file that differs from the pin is an
error, never a fallback to another SDK. Synchronous so that synchronous
callers (transaction planning, address derivation) share the same authority.

## Returns

`any`
