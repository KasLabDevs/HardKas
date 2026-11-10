[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ZkCorpusSchema

# Variable: ZkCorpusSchema

> `const` **ZkCorpusSchema**: `ZodObject`\<\{ `claims`: `ZodRecord`\<`ZodString`, `ZodString`\>; `expectedKnownLimitations`: `ZodArray`\<`ZodString`, `"many"`\>; `experimental`: `ZodLiteral`\<`true`\>; `fixtures`: `ZodArray`\<`ZodObject`\<\{ `allowWeakVerificationKey`: `ZodOptional`\<`ZodBoolean`\>; `expectedMathStatus`: `ZodOptional`\<`ZodString`\>; `expectedStatus`: `ZodString`; `id`: `ZodString`; `path`: `ZodString`; `pinnedVerificationKeyId`: `ZodOptional`\<`ZodString`\>; \}, `"strip"`, `ZodTypeAny`, \{ `allowWeakVerificationKey?`: `boolean`; `expectedMathStatus?`: `string`; `expectedStatus?`: `string`; `id?`: `string`; `path?`: `string`; `pinnedVerificationKeyId?`: `string`; \}, \{ `allowWeakVerificationKey?`: `boolean`; `expectedMathStatus?`: `string`; `expectedStatus?`: `string`; `id?`: `string`; `path?`: `string`; `pinnedVerificationKeyId?`: `string`; \}\>, `"many"`\>; `network`: `ZodString`; `profile`: `ZodString`; `proofSystems`: `ZodArray`\<`ZodString`, `"many"`\>; `schema`: `ZodLiteral`\<`"hardkas.zkCorpus.v1"`\>; `version`: `ZodString`; \}, `"strip"`, `ZodTypeAny`, \{ `claims?`: `Record`\<`string`, `string`\>; `expectedKnownLimitations?`: `string`[]; `experimental?`: `true`; `fixtures?`: `object`[]; `network?`: `string`; `profile?`: `string`; `proofSystems?`: `string`[]; `schema?`: `"hardkas.zkCorpus.v1"`; `version?`: `string`; \}, \{ `claims?`: `Record`\<`string`, `string`\>; `expectedKnownLimitations?`: `string`[]; `experimental?`: `true`; `fixtures?`: `object`[]; `network?`: `string`; `profile?`: `string`; `proofSystems?`: `string`[]; `schema?`: `"hardkas.zkCorpus.v1"`; `version?`: `string`; \}\>

Defined in: [packages/artifacts/src/schemas.ts:1537](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/schemas.ts#L1537)
