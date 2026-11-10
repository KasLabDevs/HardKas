[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / SignatureEntrySchema

# Variable: SignatureEntrySchema

> `const` **SignatureEntrySchema**: `ZodEffects`\<`ZodObject`\<\{ `kind`: `ZodOptional`\<`ZodLiteral`\<`"synthetic"`\>\>; `signature`: `ZodOptional`\<`ZodString`\>; `signer`: `ZodString`; \}, `"strip"`, `ZodTypeAny`, \{ `kind?`: `"synthetic"`; `signature?`: `string`; `signer?`: `string`; \}, \{ `kind?`: `"synthetic"`; `signature?`: `string`; `signer?`: `string`; \}\>, \{ `kind?`: `"synthetic"`; `signature?`: `string`; `signer?`: `string`; \}, \{ `kind?`: `"synthetic"`; `signature?`: `string`; `signer?`: `string`; \}\>

Defined in: [packages/artifacts/src/schemas.ts:644](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/schemas.ts#L644)

A multisig entry is EITHER a real signature (\{ signer, signature \}) OR, in the
simulator's synthetic model (Wave 1.4 · IC-6′.4), a synthetic marker
(\{ signer, kind: "synthetic" \}) — never presented as a signature.
