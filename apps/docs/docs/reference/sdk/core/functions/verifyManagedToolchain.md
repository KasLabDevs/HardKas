[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / verifyManagedToolchain

# Function: verifyManagedToolchain()

> **verifyManagedToolchain**(`ref`, `dir?`): `Promise`\<[`ToolchainVerification`](../interfaces/ToolchainVerification.md)\>

Defined in: [packages/core/src/toolchains.ts:182](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L182)

Checks an installed toolchain against its pin: every pinned file present
with the pinned size and digest, nothing else besides the install record,
and a record that names this exact release asset.

## Parameters

### ref

[`ManagedToolchainReference`](../interfaces/ManagedToolchainReference.md)

### dir?

`string` = `...`

## Returns

`Promise`\<[`ToolchainVerification`](../interfaces/ToolchainVerification.md)\>
