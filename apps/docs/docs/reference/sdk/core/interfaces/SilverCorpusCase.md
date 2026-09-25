[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / SilverCorpusCase

# Interface: SilverCorpusCase

Defined in: [packages/core/src/silverscript-corpus.ts:55](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L55)

## Properties

### capabilities

> `readonly` **capabilities**: readonly (`"silver.compile.v1"` \| `"silver.p2sh.deploy-spend.v1"` \| `"silver.p2sh.relative-timelock.v1"` \| `"toccata.covenant.auth-1to1-transition.v1"`)[]

Defined in: [packages/core/src/silverscript-corpus.ts:60](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L60)

***

### compiles

> `readonly` **compiles**: readonly [`SilverCorpusCompile`](SilverCorpusCompile.md)[]

Defined in: [packages/core/src/silverscript-corpus.ts:62](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L62)

***

### covenant?

> `readonly` `optional` **covenant?**: `object`

Defined in: [packages/core/src/silverscript-corpus.ts:64](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L64)

Covenant lineage, recomputable from the recorded genesis.

#### compile

> `readonly` **compile**: `string`

#### covenantId

> `readonly` **covenantId**: `string`

#### genesisOutpoint

> `readonly` **genesisOutpoint**: `object`

##### genesisOutpoint.index

> `readonly` **index**: `number`

##### genesisOutpoint.transactionId

> `readonly` **transactionId**: `string`

#### genesisValueSompi

> `readonly` **genesisValueSompi**: `string`

#### successorCompile

> `readonly` **successorCompile**: `string`

#### successorCovenantId

> `readonly` **successorCovenantId**: `string`

***

### evidence

> `readonly` **evidence**: `string`

Defined in: [packages/core/src/silverscript-corpus.ts:72](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L72)

***

### id

> `readonly` **id**: `string`

Defined in: [packages/core/src/silverscript-corpus.ts:57](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L57)

***

### network

> `readonly` **network**: `string`

Defined in: [packages/core/src/silverscript-corpus.ts:61](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L61)

***

### scenario

> `readonly` **scenario**: `string`

Defined in: [packages/core/src/silverscript-corpus.ts:58](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L58)

***

### schema

> `readonly` **schema**: `"hardkas.silverCorpusCase.v1"`

Defined in: [packages/core/src/silverscript-corpus.ts:56](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L56)

***

### scope

> `readonly` **scope**: `string`

Defined in: [packages/core/src/silverscript-corpus.ts:59](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L59)
