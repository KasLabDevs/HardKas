[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / SilverSuccessorRequest

# Interface: SilverSuccessorRequest

Defined in: [packages/core/src/silverscript-covenant.ts:114](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-covenant.ts#L114)

## Properties

### constructorArgs

> `readonly` **constructorArgs**: readonly [`SilArtifactValue`](../type-aliases/SilArtifactValue.md)[]

Defined in: [packages/core/src/silverscript-covenant.ts:117](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-covenant.ts#L117)

The constructor arguments the current (on-chain) state was compiled with.

***

### contractName?

> `readonly` `optional` **contractName?**: `string`

Defined in: [packages/core/src/silverscript-covenant.ts:118](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-covenant.ts#L118)

***

### home?

> `readonly` `optional` **home?**: `string`

Defined in: [packages/core/src/silverscript-covenant.ts:126](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-covenant.ts#L126)

***

### nextState

> `readonly` **nextState**: `Readonly`\<`Record`\<`string`, [`SilArtifactValue`](../type-aliases/SilArtifactValue.md)\>\>

Defined in: [packages/core/src/silverscript-covenant.ts:125](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-covenant.ts#L125)

The successor state, one value per `State` field.

***

### source

> `readonly` **source**: `string` \| `Uint8Array`\<`ArrayBufferLike`\>

Defined in: [packages/core/src/silverscript-covenant.ts:115](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-covenant.ts#L115)

***

### stateToConstructorArg

> `readonly` **stateToConstructorArg**: `Readonly`\<`Record`\<`string`, `number`\>\>

Defined in: [packages/core/src/silverscript-covenant.ts:123](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-covenant.ts#L123)

For every `State` field, the index of the constructor parameter that
initializes it directly (`int value = init_value;` ⇒ `{ value: 0 }`).
