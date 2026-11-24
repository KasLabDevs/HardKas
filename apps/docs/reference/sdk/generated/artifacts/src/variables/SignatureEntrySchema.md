[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / SignatureEntrySchema

# Variable: SignatureEntrySchema

> `const` **SignatureEntrySchema**: `ZodObject`\<\{ `kind`: `ZodOptional`\<`ZodLiteral`\<`"synthetic"`\>\>; `signature`: `ZodOptional`\<`ZodString`\>; `signer`: `ZodString`; \}, `$strip`\>

Defined in: [packages/artifacts/src/schemas.ts:663](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/schemas.ts#L663)

A multisig entry is EITHER a real signature (\{ signer, signature \}) OR, in the
simulator's synthetic model (Wave 1.4 · IC-6′.4), a synthetic marker
(\{ signer, kind: "synthetic" \}) — never presented as a signature.
