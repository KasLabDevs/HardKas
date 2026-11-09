[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / V4\_SEMANTIC\_EXCLUSIONS

# Variable: V4\_SEMANTIC\_EXCLUSIONS

> `const` **V4\_SEMANTIC\_EXCLUSIONS**: `Set`\<`string`\>

Defined in: [packages/artifacts/src/canonical.ts:43](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/canonical.ts#L43)

Legacy exclusion set (hash version 4): keys dropped BY NAME AT ANY DEPTH.
Frozen: only used to verify artifacts that declare version 4. This rule is
what let `status`, `sourceSignedId`, `dagContext` and nested references
change without touching the hash (audit AUD-11 / P1–P3 / R1–R3 / N1).
