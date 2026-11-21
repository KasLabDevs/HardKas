[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / DiffEntry

# Interface: DiffEntry

Defined in: [packages/artifacts/src/diff.ts:4](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/diff.ts#L4)

## Properties

### kind

> **kind**: `"added"` \| `"removed"` \| `"changed"`

Defined in: [packages/artifacts/src/diff.ts:6](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/diff.ts#L6)

***

### left?

> `optional` **left?**: `any`

Defined in: [packages/artifacts/src/diff.ts:7](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/diff.ts#L7)

***

### path

> **path**: `string`

Defined in: [packages/artifacts/src/diff.ts:5](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/diff.ts#L5)

***

### right?

> `optional` **right?**: `any`

Defined in: [packages/artifacts/src/diff.ts:8](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/diff.ts#L8)

***

### secret?

> `optional` **secret?**: `true`

Defined in: [packages/artifacts/src/diff.ts:10](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/artifacts/src/diff.ts#L10)

A field that holds secret material differs: its values are never carried, only that it differs.
