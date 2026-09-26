[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HardkasL2

# Class: HardkasL2

Defined in: [packages/sdk/src/l2.ts:9](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/l2.ts#L9)

**`Alpha`**

HardKAS L2 Module

## Constructors

### Constructor

> **new HardkasL2**(`sdk`): `HardkasL2`

Defined in: [packages/sdk/src/l2.ts:12](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/l2.ts#L12)

**`Alpha`**

#### Parameters

##### sdk

[`Hardkas`](Hardkas.md)

#### Returns

`HardkasL2`

## Properties

### igra

> `readonly` **igra**: [`HardkasIgra`](HardkasIgra.md)

Defined in: [packages/sdk/src/l2.ts:10](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/l2.ts#L10)

**`Alpha`**

## Methods

### bridge()

> **bridge**(): `Promise`\<`never`\>

Defined in: [packages/sdk/src/l2.ts:46](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/l2.ts#L46)

**`Alpha`**

L2 bridge surface (Experimental)

#### Returns

`Promise`\<`never`\>

***

### contract()

> **contract**(): `Promise`\<`never`\>

Defined in: [packages/sdk/src/l2.ts:39](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/l2.ts#L39)

**`Alpha`**

L2 contract surface (Experimental)

#### Returns

`Promise`\<`never`\>

***

### getProfile()

> **getProfile**(`name`): `L2NetworkProfile`

Defined in: [packages/sdk/src/l2.ts:25](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/l2.ts#L25)

**`Alpha`**

Gets a specific L2 network profile by name.

#### Parameters

##### name

`string`

#### Returns

`L2NetworkProfile`

***

### listProfiles()

> **listProfiles**(): readonly `L2NetworkProfile`[]

Defined in: [packages/sdk/src/l2.ts:18](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/l2.ts#L18)

**`Alpha`**

Lists all available L2 network profiles.

#### Returns

readonly `L2NetworkProfile`[]

***

### tx()

> **tx**(): `Promise`\<`never`\>

Defined in: [packages/sdk/src/l2.ts:32](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/sdk/src/l2.ts#L32)

**`Alpha`**

L2 transaction surface (Experimental)

#### Returns

`Promise`\<`never`\>
