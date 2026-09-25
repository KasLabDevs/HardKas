[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / compileSilverScript

# Function: compileSilverScript()

> **compileSilverScript**(`request`): `Promise`\<[`SilverCompileResult`](../interfaces/SilverCompileResult.md)\>

Defined in: [packages/core/src/silverscript.ts:477](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L477)

Compiles SilverScript source with the managed silverc and validates the result.

The source and constructor arguments are written to a private temporary
directory, so the bytes digested are exactly the bytes compiled. Any compiler
failure or unexpected output is an error; nothing is substituted.

## Parameters

### request

[`SilverCompileRequest`](../interfaces/SilverCompileRequest.md)

## Returns

`Promise`\<[`SilverCompileResult`](../interfaces/SilverCompileResult.md)\>
