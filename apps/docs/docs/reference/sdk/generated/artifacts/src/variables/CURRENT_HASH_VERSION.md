[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / CURRENT\_HASH\_VERSION

# Variable: CURRENT\_HASH\_VERSION

> `const` **CURRENT\_HASH\_VERSION**: `5` = `5`

Defined in: [packages/artifacts/src/canonical.ts:134](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/canonical.ts#L134)

Current canonicalization version.
v1: BigInt(123) -\> "123" (Collision with String "123")
v2: BigInt(123) -\> "n:123" (Distinguishable)
v3: String normalization (\r\n -\> \n, NFC) for cross-platform stability.
v4: Strict Metadata Integrity (includes lineage, parentArtifactId, signatureMetadata, etc in the hash).
v5: Closed top-level exclusion list, exact-path self references, derived labels
    recomputed by the verifier, `hashVersion` authenticated, no exclusion by key
    name at depth (Closure Pack IC-1′, decision Q1-B′).
