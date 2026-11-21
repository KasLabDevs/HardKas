[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / V4\_SEMANTIC\_EXCLUSIONS

# Variable: V4\_SEMANTIC\_EXCLUSIONS

> `const` **V4\_SEMANTIC\_EXCLUSIONS**: `Set`\<`string`\>

Defined in: [packages/artifacts/src/canonical.ts:43](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/canonical.ts#L43)

Legacy exclusion set (hash version 4): keys dropped BY NAME AT ANY DEPTH.
Frozen: only used to verify artifacts that declare version 4. This rule is
what let `status`, `sourceSignedId`, `dagContext` and nested references
change without touching the hash (audit AUD-11 / P1–P3 / R1–R3 / N1).
