[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / parseSilArtifactValuesJson

# Function: parseSilArtifactValuesJson()

> **parseSilArtifactValuesJson**(`text`): [`SilArtifactValue`](../type-aliases/SilArtifactValue.md)[]

Defined in: [packages/core/src/silverscript.ts:317](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L317)

Parses `{kind, value}` JSON (e.g. a constructor-args file) into values,
keeping ints exact: they are read as literals, never through a JS number.

## Parameters

### text

`string`

## Returns

[`SilArtifactValue`](../type-aliases/SilArtifactValue.md)[]
