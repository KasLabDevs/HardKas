[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / TxReceiptArtifactV1

# Interface: TxReceiptArtifactV1

Defined in: [packages/artifacts/src/types.ts:156](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L156)

## Extends

- [`HardkasArtifactBase`](HardkasArtifactBase.md)

## Properties

### amount

> `readonly` **amount**: `string`

Defined in: [packages/artifacts/src/types.ts:174](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L174)

***

### amountSompi

> `readonly` **amountSompi**: `string`

Defined in: [packages/artifacts/src/types.ts:173](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L173)

***

### blueScore?

> `readonly` `optional` **blueScore?**: `string`

Defined in: [packages/artifacts/src/types.ts:178](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L178)

***

### confirmedAt?

> `readonly` `optional` **confirmedAt?**: `string`

Defined in: [packages/artifacts/src/types.ts:181](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L181)

***

### createdAt

> **createdAt**: `string`

Defined in: [packages/artifacts/src/types.ts:29](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L29)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`createdAt`](HardkasArtifactBase.md#createdat)

***

### daaScore?

> `readonly` `optional` **daaScore?**: `string`

Defined in: [packages/artifacts/src/types.ts:177](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L177)

***

### feeSompi

> `readonly` **feeSompi**: `string`

Defined in: [packages/artifacts/src/types.ts:175](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L175)

***

### from

> `readonly` **from**: `object`

Defined in: [packages/artifacts/src/types.ts:164](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L164)

#### accountName?

> `readonly` `optional` **accountName?**: `string`

#### address

> `readonly` **address**: `string`

***

### hardkasVersion

> **hardkasVersion**: `string`

Defined in: [packages/artifacts/src/types.ts:24](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L24)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`hardkasVersion`](HardkasArtifactBase.md#hardkasversion)

***

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

Defined in: [packages/artifacts/src/types.ts:26](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L26)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`hashVersion`](HardkasArtifactBase.md#hashversion)

***

### metadata?

> `readonly` `optional` **metadata?**: `Record`\<`string`, `any`\>

Defined in: [packages/artifacts/src/types.ts:187](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L187)

***

### mode

> **mode**: [`AnyExecutionMode`](../type-aliases/AnyExecutionMode.md)

Defined in: [packages/artifacts/src/types.ts:28](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L28)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`mode`](HardkasArtifactBase.md#mode)

***

### networkId

> **networkId**: [`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

Defined in: [packages/artifacts/src/types.ts:27](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L27)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`networkId`](HardkasArtifactBase.md#networkid)

***

### receiptPath?

> `readonly` `optional` **receiptPath?**: `string`

Defined in: [packages/artifacts/src/types.ts:184](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L184)

***

### rpcUrl

> `readonly` **rpcUrl**: `string`

Defined in: [packages/artifacts/src/types.ts:182](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L182)

***

### schema

> `readonly` **schema**: `"hardkas.txReceipt.v1"`

Defined in: [packages/artifacts/src/types.ts:157](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L157)

#### Overrides

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`schema`](HardkasArtifactBase.md#schema)

***

### schemaVersion?

> `optional` **schemaVersion?**: `string`

Defined in: [packages/artifacts/src/types.ts:23](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L23)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`schemaVersion`](HardkasArtifactBase.md#schemaversion)

***

### sourceSignedId?

> `readonly` `optional` **sourceSignedId?**: [`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

Defined in: [packages/artifacts/src/types.ts:161](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L161)

***

### sourceSignedPath?

> `readonly` `optional` **sourceSignedPath?**: `string`

Defined in: [packages/artifacts/src/types.ts:162](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L162)

***

### status

> `readonly` **status**: `"submitted"` \| `"accepted"` \| `"confirmed"` \| `"finalized"` \| `"failed"`

Defined in: [packages/artifacts/src/types.ts:158](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L158)

***

### submittedAt

> `readonly` **submittedAt**: `string`

Defined in: [packages/artifacts/src/types.ts:180](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L180)

***

### to

> `readonly` **to**: `object`

Defined in: [packages/artifacts/src/types.ts:169](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L169)

#### address

> `readonly` **address**: `string`

***

### tracePath?

> `readonly` `optional` **tracePath?**: `string`

Defined in: [packages/artifacts/src/types.ts:185](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L185)

***

### txId

> `readonly` **txId**: [`TxId`](../../../sdk/src/type-aliases/TxId.md)

Defined in: [packages/artifacts/src/types.ts:160](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L160)

***

### version

> **version**: `string`

Defined in: [packages/artifacts/src/types.ts:25](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L25)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`version`](HardkasArtifactBase.md#version)
