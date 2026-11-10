[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / LookupClassification

# Type Alias: LookupClassification

> **LookupClassification** = \{ `kind`: `"path"`; \} \| \{ `kind`: `"artifactId"`; \} \| \{ `kind`: `"namespaced"`; `namespace`: `Exclude`\<[`LookupNamespace`](LookupNamespace.md), `"artifact"`\>; `replacement`: [`LookupInput`](LookupInput.md); \} \| \{ `kind`: `"unknown"`; \}

Defined in: [packages/artifacts/src/resolve.ts:70](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/resolve.ts#L70)
