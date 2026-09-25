[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / verifyArtifactFile

# Variable: verifyArtifactFile

> `const` **verifyArtifactFile**: (`artifactOrPath`, `context`) => `Promise`\<[`ArtifactVerificationResult`](../type-aliases/ArtifactVerificationResult.md)\> = `verifyArtifactIntegrity`

Defined in: [packages/artifacts/src/verify.ts:814](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/verify.ts#L814)

Verifies an artifact's integrity asynchronously.
Can take a raw object or a file path.

## Parameters

### artifactOrPath

`unknown`

### context?

[`VerificationContext`](../interfaces/VerificationContext.md) = `{}`

## Returns

`Promise`\<[`ArtifactVerificationResult`](../type-aliases/ArtifactVerificationResult.md)\>
