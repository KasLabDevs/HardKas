[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / serializeSilArtifactValues

# Function: serializeSilArtifactValues()

> **serializeSilArtifactValues**(`values`): `string`

Defined in: [packages/core/src/silverscript.ts:351](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L351)

The exact JSON handed to silverc as `--constructor-args`, in silverscript-abi's
`{kind, value}` form. Deterministic, so its digest identifies the arguments
without recording them.

## Parameters

### values

readonly [`SilArtifactValue`](../type-aliases/SilArtifactValue.md)[]

## Returns

`string`
