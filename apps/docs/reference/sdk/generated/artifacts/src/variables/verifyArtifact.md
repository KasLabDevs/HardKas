[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / verifyArtifact

# ~~Variable: verifyArtifact~~

> `const` **verifyArtifact**: (`artifactOrPath`, `context`) => `Promise`\<[`ArtifactVerificationResult`](../type-aliases/ArtifactVerificationResult.md)\> = `verifyArtifactIntegrity`

Defined in: [packages/artifacts/src/verify.ts:1018](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/verify.ts#L1018)

Verifies an artifact's integrity asynchronously.
Can take a raw object or a file path.

## Parameters

### artifactOrPath

`unknown`

### context?

[`VerificationContext`](../interfaces/VerificationContext.md) = `{}`

## Returns

`Promise`\<[`ArtifactVerificationResult`](../type-aliases/ArtifactVerificationResult.md)\>

## Deprecated

Use verifyArtifactIntegrity instead.
