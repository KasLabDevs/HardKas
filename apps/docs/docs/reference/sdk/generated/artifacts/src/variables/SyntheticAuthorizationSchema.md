[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / SyntheticAuthorizationSchema

# Variable: SyntheticAuthorizationSchema

> `const` **SyntheticAuthorizationSchema**: `ZodObject`\<\{ `kind`: `ZodLiteral`\<`"synthetic"`\>; `planArtifactId`: `ZodString`; `signers`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `"strict"`, `ZodTypeAny`, \{ `kind?`: `"synthetic"`; `planArtifactId?`: `string`; `signers?`: `string`[]; \}, \{ `kind?`: `"synthetic"`; `planArtifactId?`: `string`; `signers?`: `string`[]; \}\>

Defined in: [packages/artifacts/src/schemas.ts:659](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/schemas.ts#L659)

Wave 1.4 · IC-6′.1/.3: the authenticated binding of a simulator "signed"
artifact to ONE plan (by artifactId) by the account identities that
authorized it. Lives in the hashed body; never in `signatureMetadata`.
