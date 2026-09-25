[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / CURRENT\_HASH\_VERSION

# Variable: CURRENT\_HASH\_VERSION

> `const` **CURRENT\_HASH\_VERSION**: `4` = `4`

Defined in: [packages/artifacts/src/canonical.ts:76](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/canonical.ts#L76)

Current canonicalization version.
v1: BigInt(123) -> "123" (Collision with String "123")
v2: BigInt(123) -> "n:123" (Distinguishable)
v3: String normalization (\r\n -> \n, NFC) for cross-platform stability.
v4: Strict Metadata Integrity (includes lineage, parentArtifactId, signatureMetadata, etc in the hash).
