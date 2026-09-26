[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / SilverCompileProvenance

# Interface: SilverCompileProvenance

Defined in: [packages/core/src/silverscript.ts:396](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L396)

What was compiled, by what, into what — digests and public identities only.
Constructor arguments are recorded by digest: they may carry private material.
No timestamps: the same inputs always yield the same record.

## Properties

### abiSchemaVersion

> `readonly` **abiSchemaVersion**: `number`

Defined in: [packages/core/src/silverscript.ts:411](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L411)

***

### artifactSha256

> `readonly` **artifactSha256**: `string`

Defined in: [packages/core/src/silverscript.ts:410](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L410)

***

### compiler

> `readonly` **compiler**: `object`

Defined in: [packages/core/src/silverscript.ts:398](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L398)

#### assetName

> `readonly` **assetName**: `string`

#### assetSha256

> `readonly` **assetSha256**: `string`

#### binarySha256

> `readonly` **binarySha256**: `string`

#### commit

> `readonly` **commit**: `string`

#### id

> `readonly` **id**: `"silverc"`

#### languageVersion

> `readonly` **languageVersion**: `string`

#### releaseTag

> `readonly` **releaseTag**: `string`

#### repository

> `readonly` **repository**: `string`

***

### constructorArgsSha256

> `readonly` **constructorArgsSha256**: `string`

Defined in: [packages/core/src/silverscript.ts:409](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L409)

***

### contracts

> `readonly` **contracts**: readonly `object`[]

Defined in: [packages/core/src/silverscript.ts:412](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L412)

***

### schema

> `readonly` **schema**: `"hardkas.silver.compileProvenance.v1"`

Defined in: [packages/core/src/silverscript.ts:397](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L397)

***

### sourceSha256

> `readonly` **sourceSha256**: `string`

Defined in: [packages/core/src/silverscript.ts:408](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript.ts#L408)
