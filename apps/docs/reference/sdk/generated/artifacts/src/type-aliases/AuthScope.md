[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / AuthScope

# Type Alias: AuthScope

> **AuthScope** = `"FULL"` \| `"LEGACY"` \| `"NONE"`

Defined in: [packages/artifacts/src/verify.ts:172](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/verify.ts#L172)

What the content hash actually authenticated (Closure Pack D-Q1.e / D-Q21):
- FULL: current hash version; every field outside the closed operational list.
- LEGACY: a version 1–4 artifact verified under its own rules; the fields in
  `unauthenticatedMaterialFields` were never covered. No decision path may act on them.
- NONE: integrity could not be established (invalid hashVersion, unreadable input).
