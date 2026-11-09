[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / recomputeDeclaredContentHash

# Function: recomputeDeclaredContentHash()

> **recomputeDeclaredContentHash**(`artifact`): `string`

Defined in: [packages/artifacts/src/canonical.ts:186](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/canonical.ts#L186)

Recomputes an artifact's content hash with the version it DECLARES. This is
the single function to use outside a producer (IC-1′.8): a bare
`calculateContentHash(x)` would silently apply the current version to a legacy
artifact and report a false mismatch.

## Parameters

### artifact

`unknown`

## Returns

`string`
