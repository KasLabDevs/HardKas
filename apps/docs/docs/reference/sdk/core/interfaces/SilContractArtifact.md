[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / SilContractArtifact

# Interface: SilContractArtifact

Defined in: [packages/core/src/silverscript.ts:63](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L63)

## Properties

### compiled

> `readonly` **compiled**: `object`

Defined in: [packages/core/src/silverscript.ts:69](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L69)

#### bytecode

> `readonly` **bytecode**: readonly `number`[]

#### state\_span

> `readonly` **state\_span**: `object`

##### state\_span.len

> `readonly` **len**: `number`

##### state\_span.offset

> `readonly` **offset**: `number`

#### template\_hash

> `readonly` **template\_hash**: readonly `number`[]

***

### cov\_decl\_to\_abi?

> `readonly` `optional` **cov\_decl\_to\_abi?**: `Readonly`\<`Record`\<`string`, `string`\>\>

Defined in: [packages/core/src/silverscript.ts:67](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L67)

***

### delegate\_entry\_abi?

> `readonly` `optional` **delegate\_entry\_abi?**: `string`

Defined in: [packages/core/src/silverscript.ts:68](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L68)

***

### entries

> `readonly` **entries**: `Readonly`\<`Record`\<`string`, [`SilEntryArtifact`](SilEntryArtifact.md)\>\>

Defined in: [packages/core/src/silverscript.ts:66](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L66)

***

### runtime\_state

> `readonly` **runtime\_state**: `object`

Defined in: [packages/core/src/silverscript.ts:65](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L65)

#### fields

> `readonly` **fields**: readonly [`SilNamedType`](SilNamedType.md)[]

#### source

> `readonly` **source**: `string`

***

### source\_path

> `readonly` **source\_path**: `string`

Defined in: [packages/core/src/silverscript.ts:64](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L64)
