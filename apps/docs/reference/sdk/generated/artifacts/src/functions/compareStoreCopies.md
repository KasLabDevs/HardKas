[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / compareStoreCopies

# Function: compareStoreCopies()

> **compareStoreCopies**(`a`, `b`): `number`

Defined in: [packages/artifacts/src/resolve.ts:257](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/resolve.ts#L257)

WORKSPACE-AUTHORITY-1 (C1) · which copy represents an identity the store holds at several paths: a copy in a canonical
subdirectory (where `publishArtifact` writes it once) before a copy at the store root (such as the `tx plan` lattice
copy), then by path. The query projection and the filesystem query backend both apply it, so they answer with the same
file for the same artifact.

## Parameters

### a

`string`

### b

`string`

## Returns

`number`
