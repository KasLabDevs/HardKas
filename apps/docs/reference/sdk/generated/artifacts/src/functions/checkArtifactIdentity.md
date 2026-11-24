[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / checkArtifactIdentity

# Function: checkArtifactIdentity()

> **checkArtifactIdentity**(`artifact`): [`CandidateCheck`](../type-aliases/CandidateCheck.md)

Defined in: [packages/artifacts/src/resolve.ts:315](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/resolve.ts#L315)

Recomputes the artifact under the version it declares and checks every identity
it claims (contentHash, lineage.artifactId) and its derived label. Nothing is
inferred: an artifact without a valid hashVersion cannot be an identity.

## Parameters

### artifact

`any`

## Returns

[`CandidateCheck`](../type-aliases/CandidateCheck.md)
