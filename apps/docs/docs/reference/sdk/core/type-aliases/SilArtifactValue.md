[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / SilArtifactValue

# Type Alias: SilArtifactValue

> **SilArtifactValue** = \{ `kind`: `"int"`; `value`: `bigint` \| `number`; \} \| \{ `kind`: `"bool"`; `value`: `boolean`; \} \| \{ `kind`: `"byte"`; `value`: `number`; \} \| \{ `kind`: `"bytes"`; `value`: `Uint8Array` \| readonly `number`[]; \} \| \{ `kind`: `"text"`; `value`: `string`; \} \| \{ `kind`: `"array"`; `value`: readonly `SilArtifactValue`[]; \} \| \{ `kind`: `"object"`; `value`: `Readonly`\<`Record`\<`string`, `SilArtifactValue`\>\>; \}

Defined in: [packages/core/src/silverscript.ts:256](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L256)
