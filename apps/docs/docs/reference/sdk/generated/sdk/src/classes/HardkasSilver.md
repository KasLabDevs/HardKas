[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasSilver

# Class: HardkasSilver

Defined in: [packages/sdk/src/silver.ts:41](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/silver.ts#L41)

## Constructors

### Constructor

> **new HardkasSilver**(`sdk`): `HardkasSilver`

Defined in: [packages/sdk/src/silver.ts:42](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/silver.ts#L42)

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasSilver`

## Methods

### compile()

> **compile**(`options`): `Promise`\<`SilverCompileResult`\>

Defined in: [packages/sdk/src/silver.ts:44](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/silver.ts#L44)

#### Parameters

##### options

[`SilverCompileOptions`](../interfaces/SilverCompileOptions.md)

#### Returns

`Promise`\<`SilverCompileResult`\>

***

### p2sh()

> **p2sh**(`compiled`, `options?`): [`SilverP2sh`](../interfaces/SilverP2sh.md)

Defined in: [packages/sdk/src/silver.ts:61](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/silver.ts#L61)

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

Defined in: [packages/sdk/src/silver.ts:52](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/silver.ts#L52)

Recompiles and requires silverc to reproduce `compiled` byte for byte.

#### Parameters

##### options

[`SilverCompileOptions`](../interfaces/SilverCompileOptions.md) & `object`

#### Returns

`Promise`\<`SilverCompileResult`\>

***

### verifyCorpus()

> **verifyCorpus**(`corpusPath?`): `Promise`\<`SilverCorpusVerifyResult`\>

Defined in: [packages/sdk/src/silver.ts:72](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/silver.ts#L72)

The golden corpus: every case recompiled, derived and checked against its evidence.

#### Parameters

##### corpusPath?

`string` = `"fixtures/toccata-v2/silver"`

#### Returns

`Promise`\<`SilverCorpusVerifyResult`\>
