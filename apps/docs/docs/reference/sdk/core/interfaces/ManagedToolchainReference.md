[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / ManagedToolchainReference

# Interface: ManagedToolchainReference

Defined in: [packages/core/src/toolchains.ts:21](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L21)

## Properties

### archive

> `readonly` **archive**: `"zip"` \| `"tar.gz"`

Defined in: [packages/core/src/toolchains.ts:30](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L30)

Container format of the release asset.

***

### assetName

> `readonly` **assetName**: `string`

Defined in: [packages/core/src/toolchains.ts:25](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L25)

***

### assetSha256

> `readonly` **assetSha256**: `string`

Defined in: [packages/core/src/toolchains.ts:28](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L28)

SHA-256 of the release asset, as published on the GitHub release.

***

### assetSubdir

> `readonly` **assetSubdir**: `string`

Defined in: [packages/core/src/toolchains.ts:32](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L32)

Directory inside the asset whose files are installed.

***

### entry

> `readonly` **entry**: `string`

Defined in: [packages/core/src/toolchains.ts:34](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L34)

Module or program used from the install directory.

***

### executables?

> `readonly` `optional` **executables?**: readonly `string`[]

Defined in: [packages/core/src/toolchains.ts:36](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L36)

Pinned files installed as executables (mode 0755 on POSIX).

***

### files

> `readonly` **files**: `Readonly`\<`Record`\<`string`, [`ManagedToolchainFile`](ManagedToolchainFile.md)\>\>

Defined in: [packages/core/src/toolchains.ts:37](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L37)

***

### id

> `readonly` **id**: `string`

Defined in: [packages/core/src/toolchains.ts:22](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L22)

***

### releaseTag

> `readonly` **releaseTag**: `string`

Defined in: [packages/core/src/toolchains.ts:24](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L24)

***

### url

> `readonly` **url**: `string`

Defined in: [packages/core/src/toolchains.ts:26](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L26)

***

### version

> `readonly` **version**: `string`

Defined in: [packages/core/src/toolchains.ts:23](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L23)
