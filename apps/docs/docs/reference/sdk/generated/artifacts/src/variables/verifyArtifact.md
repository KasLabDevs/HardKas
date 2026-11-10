[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / verifyArtifact

# ~~Variable: verifyArtifact~~

> `const` **verifyArtifact**: (`artifactOrPath`, `context`) => `Promise`\<[`ArtifactVerificationResult`](../type-aliases/ArtifactVerificationResult.md)\> = `verifyArtifactIntegrity`

Defined in: [packages/artifacts/src/verify.ts:958](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/verify.ts#L958)

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
