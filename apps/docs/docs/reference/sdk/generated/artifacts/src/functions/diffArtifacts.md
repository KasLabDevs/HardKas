[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / diffArtifacts

# Function: diffArtifacts()

> **diffArtifacts**(`left`, `right`, `options?`): [`ArtifactDiff`](../interfaces/ArtifactDiff.md)

Defined in: [packages/artifacts/src/diff.ts:35](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/diff.ts#L35)

Performs a semantic diff between two artifacts on their RAW values, ignoring volatile metadata (SEMANTIC_EXCLUSIONS
only, unless `options.exclude` names the top-level keys instead). EVIDENCE-DIFF-REDACTION-1: nothing is masked before
comparing, so two values that differ anywhere are a difference; the decision never sees a redacted form. The entries
are safe to record as evidence: public values (hashes, ids, amounts, addresses) are carried in full, while a
difference in a secret field (named by `isSecretFieldName`, or a value holding one) carries no value at all, only
`secret: true`. Presentation may redact further; it never decides equality.

## Parameters

### left

`any`

### right

`any`

### options?

[`DiffOptions`](../interfaces/DiffOptions.md) = `{}`

## Returns

[`ArtifactDiff`](../interfaces/ArtifactDiff.md)
