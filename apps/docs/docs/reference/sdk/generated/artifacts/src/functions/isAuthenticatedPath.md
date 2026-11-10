[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / isAuthenticatedPath

# Function: isAuthenticatedPath()

> **isAuthenticatedPath**(`path`, `version`): `boolean`

Defined in: [packages/artifacts/src/canonical.ts:219](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/canonical.ts#L219)

EVIDENCE-TRUST-1: whether the field at `path` is part of what the content hash covers under `version` — the inverse
of what the serializer drops, by the same rule. `path` lists the keys from the artifact's top level down, with `null`
for an array index. A field below a dropped key is outside the hash too. (`contentHash` and `lineage.artifactId` are
the identity itself, never inside it.)

## Parameters

### path

readonly `string`[]

### version

`number`

## Returns

`boolean`
