[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / parseSilverSourceAst

# Function: parseSilverSourceAst()

> **parseSilverSourceAst**(`source`, `home?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [packages/core/src/silverscript.ts:447](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L447)

The official parser's AST of a SilverScript source (`silverc --ast-only`).
Returned as silverc wrote it; callers read only the nodes they need.

## Parameters

### source

`string` \| `Uint8Array`\<`ArrayBufferLike`\>

### home?

`string`

## Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>
