[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / SyntheticAuthorizationSchema

# Variable: SyntheticAuthorizationSchema

> `const` **SyntheticAuthorizationSchema**: `ZodObject`\<\{ `kind`: `ZodLiteral`\<`"synthetic"`\>; `planArtifactId`: `ZodString`; `signers`: `ZodArray`\<`ZodString`\>; \}, `$strict`\>

Defined in: [packages/artifacts/src/schemas.ts:678](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/schemas.ts#L678)

Wave 1.4 · IC-6′.1/.3: the authenticated binding of a simulator "signed"
artifact to ONE plan (by artifactId) by the account identities that
authorized it. Lives in the hashed body; never in `signatureMetadata`.
