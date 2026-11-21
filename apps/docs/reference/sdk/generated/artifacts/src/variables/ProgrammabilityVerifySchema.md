[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ProgrammabilityVerifySchema

# Variable: ProgrammabilityVerifySchema

> `const` **ProgrammabilityVerifySchema**: `ZodObject`\<\{ `artifactEvidence`: `ZodObject`\<\{ `productClaims`: `ZodLiteral`\<`"hardkas programmability capabilities"`\>; `realNodeEvidence`: `ZodLiteral`\<`"NOT_ESTABLISHED"`\>; `reason`: `ZodString`; \}, `$strip`\>; `issues`: `ZodArray`\<`ZodObject`\<\{ `code`: `ZodString`; `file`: `ZodOptional`\<`ZodString`\>; `message`: `ZodString`; \}, `$strip`\>\>; `kind`: `ZodEnum`\<\{ `silver`: `"silver"`; `vprog`: `"vprog"`; `zk`: `"zk"`; \}\>; `ok`: `ZodBoolean`; `path`: `ZodString`; `schema`: `ZodLiteral`\<`"hardkas.programmability.verify.v1"`\>; `sourceStatus`: `ZodOptional`\<`ZodString`\>; `status`: `ZodEnum`\<\{ `PROGRAMMABILITY_VERIFY_FAIL`: `"PROGRAMMABILITY_VERIFY_FAIL"`; `PROGRAMMABILITY_VERIFY_PARTIAL`: `"PROGRAMMABILITY_VERIFY_PARTIAL"`; `PROGRAMMABILITY_VERIFY_PASS`: `"PROGRAMMABILITY_VERIFY_PASS"`; \}\>; \}, `$strip`\>

Defined in: [packages/artifacts/src/schemas.ts:1381](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/schemas.ts#L1381)
