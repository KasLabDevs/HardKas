[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / SilverCorpusVerifyResult

# Interface: SilverCorpusVerifyResult

Defined in: [packages/core/src/silverscript-corpus.ts:82](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L82)

## Properties

### capabilities

> `readonly` **capabilities**: `Readonly`\<`Partial`\<`Record`\<[`SilverCapability`](../type-aliases/SilverCapability.md), `"PASS"` \| `"FAIL"`\>\>\>

Defined in: [packages/core/src/silverscript-corpus.ts:94](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L94)

Per capability: PASS only if every case claiming it passed.

***

### cases

> `readonly` **cases**: readonly `object`[]

Defined in: [packages/core/src/silverscript-corpus.ts:95](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L95)

***

### issues

> `readonly` **issues**: readonly [`SilverCorpusIssue`](SilverCorpusIssue.md)[]

Defined in: [packages/core/src/silverscript-corpus.ts:96](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L96)

***

### ok

> `readonly` **ok**: `boolean`

Defined in: [packages/core/src/silverscript-corpus.ts:83](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L83)

***

### path

> `readonly` **path**: `string`

Defined in: [packages/core/src/silverscript-corpus.ts:85](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L85)

***

### schema

> `readonly` **schema**: `"hardkas.silverCorpusVerify.v1"`

Defined in: [packages/core/src/silverscript-corpus.ts:84](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L84)

***

### summary

> `readonly` **summary**: `object`

Defined in: [packages/core/src/silverscript-corpus.ts:86](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L86)

#### cases

> `readonly` **cases**: `number`

#### compiler

> `readonly` **compiler**: `string`

#### compilesRecompiled

> `readonly` **compilesRecompiled**: `number`

#### controlsChecked

> `readonly` **controlsChecked**: `number`

#### node

> `readonly` **node**: `string`
