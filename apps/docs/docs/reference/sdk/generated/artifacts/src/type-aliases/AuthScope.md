[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / AuthScope

# Type Alias: AuthScope

> **AuthScope** = `"FULL"` \| `"LEGACY"` \| `"NONE"`

Defined in: [packages/artifacts/src/verify.ts:103](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/verify.ts#L103)

What the content hash actually authenticated (Closure Pack D-Q1.e / D-Q21):
- FULL: current hash version; every field outside the closed operational list.
- LEGACY: a version 1–4 artifact verified under its own rules; the fields in
  `unauthenticatedMaterialFields` were never covered. No decision path may act on them.
- NONE: integrity could not be established (invalid hashVersion, unreadable input).
