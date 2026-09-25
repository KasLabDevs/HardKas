[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / installManagedToolchain

# Function: installManagedToolchain()

> **installManagedToolchain**(`ref`, `input`): `Promise`\<\{ `dir`: `string`; `record`: [`ToolchainInstallRecord`](../interfaces/ToolchainInstallRecord.md); \}\>

Defined in: [packages/core/src/toolchains.ts:237](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L237)

Installs a toolchain from files already extracted from its release asset.

Fails closed: the asset digest and every file must match the pin before
anything is written. Files are staged next to the target and swapped in with
renames, so an interrupted install never leaves a half-written toolchain
where the loader looks for it.

## Parameters

### ref

[`ManagedToolchainReference`](../interfaces/ManagedToolchainReference.md)

### input

#### assetSha256

`string`

#### files

`Readonly`\<`Record`\<`string`, `Uint8Array`\>\>

#### home?

`string`

#### installer

`string`

#### source

\{ `kind`: `"download"` \| `"file"`; `location`: `string`; \}

#### source.kind

`"download"` \| `"file"`

#### source.location

`string`

## Returns

`Promise`\<\{ `dir`: `string`; `record`: [`ToolchainInstallRecord`](../interfaces/ToolchainInstallRecord.md); \}\>
