[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / verifyArtifactIntegrity

# Function: verifyArtifactIntegrity()

> **verifyArtifactIntegrity**(`artifactOrPath`, `context?`): `Promise`\<[`ArtifactVerificationResult`](../type-aliases/ArtifactVerificationResult.md)\>

Defined in: [packages/artifacts/src/verify.ts:321](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/verify.ts#L321)

Verifies an artifact's integrity asynchronously.
Can take a raw object or a file path.

## Parameters

### artifactOrPath

`unknown`

### context?

[`VerificationContext`](../interfaces/VerificationContext.md) = `{}`

## Returns

`Promise`\<[`ArtifactVerificationResult`](../type-aliases/ArtifactVerificationResult.md)\>
