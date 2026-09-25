[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ScriptMetadataSchema

# Variable: ScriptMetadataSchema

> `const` **ScriptMetadataSchema**: `ZodObject`\<\{ `consensusImpact`: `ZodOptional`\<`ZodEnum`\<\[`"none"`, `"experimental"`\]\>\>; `experimental`: `ZodBoolean`; `language`: `ZodOptional`\<`ZodEnum`\<\[`"native"`, `"silverscript"`, `"tockata"`\]\>\>; `notes`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `version`: `ZodOptional`\<`ZodString`\>; \}, `"strip"`, `ZodTypeAny`, \{ `consensusImpact?`: `"experimental"` \| `"none"`; `experimental?`: `boolean`; `language?`: `"native"` \| `"silverscript"` \| `"tockata"`; `notes?`: `string`[]; `version?`: `string`; \}, \{ `consensusImpact?`: `"experimental"` \| `"none"`; `experimental?`: `boolean`; `language?`: `"native"` \| `"silverscript"` \| `"tockata"`; `notes?`: `string`[]; `version?`: `string`; \}\>

Defined in: [packages/artifacts/src/schemas.ts:33](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/schemas.ts#L33)
