[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / Kcc20SignOptions

# Interface: Kcc20SignOptions

Defined in: [packages/sdk/src/kcc20.ts:96](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L96)

## Extends

- `CovenantSignOptions`

## Properties

### compileRecords?

> `readonly` `optional` **compileRecords?**: readonly `Record`\<`string`, `any`\>[]

Defined in: [packages/sdk/src/covenants.ts:293](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L293)

Compile records the caller already read (wherever they are), used for the references they match — the same checks as
a workspace record (identity recomputed, artifact digests) — before the workspace is searched: by the default facts
and by a deploy without constructor arguments.

#### Inherited from

`CovenantSignOptions.compileRecords`

***

### config?

> `readonly` `optional` **config?**: `Kcc20Config`

Defined in: [packages/sdk/src/kcc20.ts:98](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L98)

The program's KCC-20 configuration (default: KCC-20's default).

***

### facts?

> `readonly` `optional` **facts?**: `V1EngineFacts`

Defined in: [packages/sdk/src/covenants.ts:287](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L287)

Where the contract facts come from (default: this workspace's compile records and the pinned silverc).

#### Inherited from

`CovenantSignOptions.facts`

***

### keys?

> `readonly` `optional` **keys?**: `V1KeyResolver`

Defined in: [packages/sdk/src/covenants.ts:297](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L297)

Library use: a key resolver of your own (default: this workspace's accounts).

#### Inherited from

`CovenantSignOptions.keys`

***

### keystorePassword?

> `readonly` `optional` **keystorePassword?**: `string`

Defined in: [packages/sdk/src/covenants.ts:295](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/covenants.ts#L295)

The keystore password of encrypted accounts this transaction signs with (development accounts need none).

#### Inherited from

`CovenantSignOptions.keystorePassword`
