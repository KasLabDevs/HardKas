[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ProgrammabilityInspectSchema

# Variable: ProgrammabilityInspectSchema

> `const` **ProgrammabilityInspectSchema**: `ZodObject`\<\{ `artifactEvidence`: `ZodObject`\<\{ `productClaims`: `ZodLiteral`\<`"hardkas programmability capabilities"`\>; `realNodeEvidence`: `ZodLiteral`\<`"NOT_ESTABLISHED"`\>; `reason`: `ZodString`; \}, `$strip`\>; `artifactSchema`: `ZodOptional`\<`ZodString`\>; `contentHash`: `ZodOptional`\<`ZodString`\>; `issues`: `ZodArray`\<`ZodObject`\<\{ `code`: `ZodString`; `file`: `ZodOptional`\<`ZodString`\>; `message`: `ZodString`; \}, `$strip`\>\>; `kind`: `ZodEnum`\<\{ `silver`: `"silver"`; `vprog`: `"vprog"`; `zk`: `"zk"`; \}\>; `ok`: `ZodBoolean`; `path`: `ZodString`; `schema`: `ZodLiteral`\<`"hardkas.programmability.inspect.v1"`\>; `sourceStatus`: `ZodOptional`\<`ZodString`\>; `status`: `ZodEnum`\<\{ `PROGRAMMABILITY_ARTIFACT_INSPECTED`: `"PROGRAMMABILITY_ARTIFACT_INSPECTED"`; `PROGRAMMABILITY_ARTIFACT_INVALID`: `"PROGRAMMABILITY_ARTIFACT_INVALID"`; \}\>; \}, `$strip`\>

Defined in: [packages/artifacts/src/schemas.ts:1354](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/schemas.ts#L1354)
