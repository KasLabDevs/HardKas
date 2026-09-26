[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / SilverCompileRequest

# Interface: SilverCompileRequest

Defined in: [packages/core/src/silverscript.ts:420](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L420)

## Properties

### constructorArgs?

> `readonly` `optional` **constructorArgs?**: readonly [`SilArtifactValue`](../type-aliases/SilArtifactValue.md)[]

Defined in: [packages/core/src/silverscript.ts:423](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L423)

***

### home?

> `readonly` `optional` **home?**: `string`

Defined in: [packages/core/src/silverscript.ts:425](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L425)

HARDKAS_HOME override for locating the managed compiler.

***

### source

> `readonly` **source**: `string` \| `Uint8Array`\<`ArrayBufferLike`\>

Defined in: [packages/core/src/silverscript.ts:422](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L422)

The exact source compiled; its bytes are what `sourceSha256` identifies.

***

### timeoutMs?

> `readonly` `optional` **timeoutMs?**: `number`

Defined in: [packages/core/src/silverscript.ts:426](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L426)
