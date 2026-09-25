[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasSilver

# Class: HardkasSilver

Defined in: [packages/sdk/src/silver.ts:37](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/silver.ts#L37)

## Constructors

### Constructor

> **new HardkasSilver**(`sdk`): `HardkasSilver`

Defined in: [packages/sdk/src/silver.ts:38](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/silver.ts#L38)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasSilver`

## Methods

### compile()

> **compile**(`options`): `Promise`\<`SilverCompileResult`\>

Defined in: [packages/sdk/src/silver.ts:40](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/silver.ts#L40)

#### Parameters

##### options

[`SilverCompileOptions`](../interfaces/SilverCompileOptions.md)

#### Returns

`Promise`\<`SilverCompileResult`\>

***

### p2sh()

> **p2sh**(`compiled`, `options?`): [`SilverP2sh`](../interfaces/SilverP2sh.md)

Defined in: [packages/sdk/src/silver.ts:57](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/silver.ts#L57)

The P2SH lock and address of a compiled contract.

#### Parameters

##### compiled

`SilverCompileResult`

##### options?

###### contract?

`string`

###### network?

`string`

#### Returns

[`SilverP2sh`](../interfaces/SilverP2sh.md)

***

### reproduce()

> **reproduce**(`options`): `Promise`\<`SilverCompileResult`\>

Defined in: [packages/sdk/src/silver.ts:48](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/silver.ts#L48)

Recompiles and requires silverc to reproduce `compiled` byte for byte.

#### Parameters

##### options

[`SilverCompileOptions`](../interfaces/SilverCompileOptions.md) & `object`

#### Returns

`Promise`\<`SilverCompileResult`\>

***

### verifyCorpus()

> **verifyCorpus**(`corpusPath?`): `Promise`\<`SilverCorpusVerifyResult`\>

Defined in: [packages/sdk/src/silver.ts:68](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/silver.ts#L68)

The golden corpus: every case recompiled, derived and checked against its evidence.

#### Parameters

##### corpusPath?

`string` = `"fixtures/toccata-v2/silver"`

#### Returns

`Promise`\<`SilverCorpusVerifyResult`\>
