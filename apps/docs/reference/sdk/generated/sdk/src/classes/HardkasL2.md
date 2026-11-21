[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasL2

# Class: HardkasL2

Defined in: [packages/sdk/src/l2.ts:9](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/l2.ts#L9)

**`Alpha`**

HardKAS L2 Module

## Constructors

### Constructor

> **new HardkasL2**(`sdk`): `HardkasL2`

Defined in: [packages/sdk/src/l2.ts:12](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/l2.ts#L12)

**`Alpha`**

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasL2`

## Properties

### igra

> `readonly` **igra**: [`HardkasIgra`](HardkasIgra.md)

Defined in: [packages/sdk/src/l2.ts:10](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/l2.ts#L10)

**`Alpha`**

## Methods

### bridge()

> **bridge**(): `Promise`\<`never`\>

Defined in: [packages/sdk/src/l2.ts:48](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/l2.ts#L48)

**`Alpha`**

L2 bridge surface: not part of the L1 core (refuses with L2_NOT_IN_CORE).

#### Returns

`Promise`\<`never`\>

***

### contract()

> **contract**(): `Promise`\<`never`\>

Defined in: [packages/sdk/src/l2.ts:41](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/l2.ts#L41)

**`Alpha`**

L2 contract surface: not part of the L1 core (refuses with L2_NOT_IN_CORE).

#### Returns

`Promise`\<`never`\>

***

### getProfile()

> **getProfile**(`_name`): `never`

Defined in: [packages/sdk/src/l2.ts:27](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/l2.ts#L27)

**`Alpha`**

L2 profiles live in `@hardkas/l2`, outside the core SDK (L2-EXT, D2): refuses with L2_EXTENSION_REQUIRED.
Its replacement is `getL2Profile(name)` in `@hardkas/l2`, which is not published in this release (a local build only).

#### Parameters

##### \_name

`string`

#### Returns

`never`

***

### listProfiles()

> **listProfiles**(): `never`

Defined in: [packages/sdk/src/l2.ts:19](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/l2.ts#L19)

**`Alpha`**

L2 profiles live in `@hardkas/l2`, outside the core SDK (L2-EXT, D2): refuses with L2_EXTENSION_REQUIRED.
Its replacement is `listL2Profiles()` in `@hardkas/l2`, which is not published in this release (a local build only).

#### Returns

`never`

***

### tx()

> **tx**(): `Promise`\<`never`\>

Defined in: [packages/sdk/src/l2.ts:34](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/l2.ts#L34)

**`Alpha`**

L2 transaction surface: not part of the L1 core (refuses with L2_NOT_IN_CORE).

#### Returns

`Promise`\<`never`\>
