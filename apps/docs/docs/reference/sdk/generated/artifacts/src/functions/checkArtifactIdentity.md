[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / checkArtifactIdentity

# Function: checkArtifactIdentity()

> **checkArtifactIdentity**(`artifact`): [`CandidateCheck`](../type-aliases/CandidateCheck.md)

Defined in: [packages/artifacts/src/resolve.ts:315](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/resolve.ts#L315)

Recomputes the artifact under the version it declares and checks every identity
it claims (contentHash, lineage.artifactId) and its derived label. Nothing is
inferred: an artifact without a valid hashVersion cannot be an identity.

## Parameters

### artifact

`any`

## Returns

[`CandidateCheck`](../type-aliases/CandidateCheck.md)
