[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / AddressObservationArtifact

# Interface: AddressObservationArtifact

Defined in: [packages/artifacts/src/types.ts:797](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L797)

## Extends

- [`HardkasArtifactBase`](HardkasArtifactBase.md)

## Properties

### address

> **address**: `string`

Defined in: [packages/artifacts/src/types.ts:804](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L804)

***

### createdAt

> **createdAt**: `string`

Defined in: [packages/artifacts/src/types.ts:29](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L29)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`createdAt`](HardkasArtifactBase.md#createdat)

***

### execution

> **execution**: `object`

Defined in: [packages/artifacts/src/types.ts:800](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L800)

#### mode

> **mode**: [`HardkasArtifactMode`](../type-aliases/HardkasArtifactMode.md)

#### network

> **network**: [`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

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

### mempool

> **mempool**: `object`

Defined in: [packages/artifacts/src/types.ts:805](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L805)

#### incoming

> **incoming**: [`ObservedTransaction`](ObservedTransaction.md)[]

#### outgoing

> **outgoing**: [`ObservedTransaction`](ObservedTransaction.md)[]

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

### observedAt

> **observedAt**: `string`

Defined in: [packages/artifacts/src/types.ts:817](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L817)

***

### schema

> **schema**: `"hardkas.observation.address.v1"`

Defined in: [packages/artifacts/src/types.ts:798](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L798)

#### Overrides

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`schema`](HardkasArtifactBase.md#schema)

***

### schemaVersion?

> `optional` **schemaVersion?**: `string`

Defined in: [packages/artifacts/src/types.ts:23](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L23)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`schemaVersion`](HardkasArtifactBase.md#schemaversion)

***

### totals

> **totals**: `object`

Defined in: [packages/artifacts/src/types.ts:810](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L810)

#### acceptedUtxoSompi

> **acceptedUtxoSompi**: `string`

#### mempoolIncomingSompi

> **mempoolIncomingSompi**: `string`

***

### type

> **type**: `"address_observation"`

Defined in: [packages/artifacts/src/types.ts:799](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L799)

***

### utxos

> **utxos**: [`ObservedUtxo`](ObservedUtxo.md)[]

Defined in: [packages/artifacts/src/types.ts:809](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L809)

***

### version

> **version**: `string`

Defined in: [packages/artifacts/src/types.ts:25](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L25)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`version`](HardkasArtifactBase.md#version)

***

### virtual

> **virtual**: `object`

Defined in: [packages/artifacts/src/types.ts:814](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L814)

#### daaScore?

> `optional` **daaScore?**: `string`
