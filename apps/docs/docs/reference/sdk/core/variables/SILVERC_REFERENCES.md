[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / SILVERC\_REFERENCES

# Variable: SILVERC\_REFERENCES

> `const` **SILVERC\_REFERENCES**: `Readonly`\<`Record`\<`string`, [`ManagedToolchainReference`](../interfaces/ManagedToolchainReference.md)\>\>

Defined in: [packages/core/src/toolchains.ts:82](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/toolchains.ts#L82)

Official silverc release assets, by `${process.platform}-${process.arch}`.
Only platforms whose extracted binary has been digested are pinned; on any
other platform the compiler is unavailable rather than unverified.
