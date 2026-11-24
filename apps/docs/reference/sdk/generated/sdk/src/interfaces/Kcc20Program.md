[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / Kcc20Program

# Interface: Kcc20Program

Defined in: [packages/sdk/src/kcc20.ts:76](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L76)

A KCC-20 program: its compile record (silverc reproduces it), its contract and the program's KCC-20 configuration.

## Properties

### compileRecord

> `readonly` **compileRecord**: `object`

Defined in: [packages/sdk/src/kcc20.ts:77](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L77)

#### artifactSha256

> `readonly` **artifactSha256**: `string`

#### contentHash

> `readonly` **contentHash**: `string`

#### path?

> `readonly` `optional` **path?**: `string`

***

### config?

> `readonly` `optional` **config?**: `Kcc20Config`

Defined in: [packages/sdk/src/kcc20.ts:83](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L83)

The program's KCC-20 artifact configuration (kcc20ParseArtifact of its kcc20.json); default: KCC-20's default.

***

### constructorArgs

> `readonly` **constructorArgs**: readonly `V1ArgValue`[]

Defined in: [packages/sdk/src/kcc20.ts:81](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L81)

The constructor arguments of the compile record.

***

### contract?

> `readonly` `optional` **contract?**: `string`

Defined in: [packages/sdk/src/kcc20.ts:79](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L79)

Default "KCC20".
