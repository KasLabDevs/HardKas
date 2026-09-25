[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / verifyArtifact

# ~~Variable: verifyArtifact~~

> `const` **verifyArtifact**: (`artifactOrPath`, `context`) => `Promise`\<[`ArtifactVerificationResult`](../type-aliases/ArtifactVerificationResult.md)\> = `verifyArtifactIntegrity`

Defined in: [packages/artifacts/src/verify.ts:813](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/verify.ts#L813)

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
