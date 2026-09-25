[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / SilTypeArtifact

# Type Alias: SilTypeArtifact

> **SilTypeArtifact** = \{ `kind`: [`SilScalarTypeKind`](SilScalarTypeKind.md); \} \| \{ `kind`: `"fixed_bytes"`; `len`: `number`; \} \| \{ `item`: `SilTypeArtifact`; `kind`: `"fixed_array"`; `len`: `number`; \} \| \{ `item`: `SilTypeArtifact`; `kind`: `"dynamic_array"`; \} \| \{ `kind`: `"struct"`; `name`: `string`; \}

Defined in: [packages/core/src/silverscript.ts:45](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L45)
