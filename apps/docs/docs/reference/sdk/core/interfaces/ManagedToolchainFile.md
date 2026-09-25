[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / ManagedToolchainFile

# Interface: ManagedToolchainFile

Defined in: [packages/core/src/toolchains.ts:15](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L15)

Single source of truth for the upstream toolchains HardKAS manages.

HardKAS does not ship these; it installs the official release asset, checks
it against the digests below and loads nothing that does not match. Change a
pin only together with evidence of the new release (tag, asset digest as
published by GitHub, and the per-file digests of the extracted package).

## Properties

### sha256

> `readonly` **sha256**: `string`

Defined in: [packages/core/src/toolchains.ts:17](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L17)

SHA-256 of the file as extracted from the release asset.

***

### size

> `readonly` **size**: `number`

Defined in: [packages/core/src/toolchains.ts:18](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L18)
