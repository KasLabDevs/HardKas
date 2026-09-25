[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / WriteFileAtomicOptions

# Interface: WriteFileAtomicOptions

Defined in: [packages/core/src/fs.ts:10](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/fs.ts#L10)

Options for atomic file writing.

## Properties

### encoding?

> `optional` **encoding?**: `BufferEncoding`

Defined in: [packages/core/src/fs.ts:12](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/fs.ts#L12)

Encoding for string data (default: utf-8)

***

### fsyncParent?

> `optional` **fsyncParent?**: `boolean`

Defined in: [packages/core/src/fs.ts:16](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/fs.ts#L16)

If true, calls fsync on the parent directory (Linux/macOS)

***

### mode?

> `optional` **mode?**: `number`

Defined in: [packages/core/src/fs.ts:14](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/fs.ts#L14)

File mode (permissions)
