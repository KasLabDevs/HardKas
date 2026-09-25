[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / writeFileAtomic

# Function: writeFileAtomic()

> **writeFileAtomic**(`targetPath`, `data`, `options?`): `Promise`\<`void`\>

Defined in: [packages/core/src/fs.ts:30](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/fs.ts#L30)

Writes a file atomically using the temp-file-and-rename pattern.
Ensures that either the entire file is written or no changes are made.

Pattern:
1. Write data to a temporary file in the same directory.
2. fsync the temporary file to ensure data is on disk.
3. Close the temporary file.
4. Rename the temporary file to the target path (atomic operation).
5. Optional: fsync the parent directory to ensure metadata is on disk.

## Parameters

### targetPath

`string`

### data

`string` \| `Buffer`\<`ArrayBufferLike`\>

### options?

[`WriteFileAtomicOptions`](../interfaces/WriteFileAtomicOptions.md) = `{}`

## Returns

`Promise`\<`void`\>
