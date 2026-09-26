[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / DeploymentRecord

# Interface: DeploymentRecord

Defined in: [packages/artifacts/src/types.ts:540](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L540)

## Extends

- [`HardkasArtifactBase`](HardkasArtifactBase.md)

## Properties

### contentHash?

> `optional` **contentHash?**: `ContentHash`

Defined in: [packages/artifacts/src/types.ts:565](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L565)

Canonical content hash of this record

***

### createdAt

> **createdAt**: `string`

Defined in: [packages/artifacts/src/types.ts:29](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L29)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`createdAt`](HardkasArtifactBase.md#createdat)

***

### deployedAddresses?

> `optional` **deployedAddresses?**: `string`[]

Defined in: [packages/artifacts/src/types.ts:555](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L555)

Deployed addresses or outputs (for covenant/contract deployments)

***

### deployedAt

> **deployedAt**: `string`

Defined in: [packages/artifacts/src/types.ts:561](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L561)

Timestamp of deployment

***

### deployer?

> `optional` **deployer?**: `string`

Defined in: [packages/artifacts/src/types.ts:557](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L557)

Deployment metadata

***

### hardkasVersion

> **hardkasVersion**: `string`

Defined in: [packages/artifacts/src/types.ts:563](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L563)

HardKAS version used

#### Overrides

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`hardkasVersion`](HardkasArtifactBase.md#hardkasversion)

***

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

Defined in: [packages/artifacts/src/types.ts:26](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L26)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`hashVersion`](HardkasArtifactBase.md#hashversion)

***

### label

> **label**: `string`

Defined in: [packages/artifacts/src/types.ts:543](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L543)

Human-readable label (e.g., "initial-funding", "vault-covenant-v1")

***

### mode

> **mode**: [`AnyExecutionMode`](../type-aliases/AnyExecutionMode.md)

Defined in: [packages/artifacts/src/types.ts:28](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L28)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`mode`](HardkasArtifactBase.md#mode)

***

### networkId

> **networkId**: [`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

Defined in: [packages/artifacts/src/types.ts:545](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L545)

Network where this was deployed

#### Overrides

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`networkId`](HardkasArtifactBase.md#networkid)

***

### notes?

> `optional` **notes?**: `string`

Defined in: [packages/artifacts/src/types.ts:567](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L567)

Notes

***

### payloadHash?

> `optional` **payloadHash?**: `string`

Defined in: [packages/artifacts/src/types.ts:559](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L559)

Content hash of the deployed payload (bytecode, script, or tx content)

***

### planArtifactId?

> `optional` **planArtifactId?**: [`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

Defined in: [packages/artifacts/src/types.ts:551](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L551)

Reference to the plan artifact that produced this deployment

***

### receiptArtifactId?

> `optional` **receiptArtifactId?**: [`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

Defined in: [packages/artifacts/src/types.ts:553](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L553)

Reference to the receipt artifact (if confirmed)

***

### schema

> **schema**: `"hardkas.deployment.v1"`

Defined in: [packages/artifacts/src/types.ts:541](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L541)

#### Overrides

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`schema`](HardkasArtifactBase.md#schema)

***

### schemaVersion?

> `optional` **schemaVersion?**: `string`

Defined in: [packages/artifacts/src/types.ts:23](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L23)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`schemaVersion`](HardkasArtifactBase.md#schemaversion)

***

### status

> **status**: `"unknown"` \| `"confirmed"` \| `"failed"` \| `"planned"` \| `"sent"`

Defined in: [packages/artifacts/src/types.ts:547](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L547)

Deployment status

***

### txId?

> `optional` **txId?**: [`TxId`](../../../sdk/src/type-aliases/TxId.md)

Defined in: [packages/artifacts/src/types.ts:549](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L549)

The transaction ID (if sent)

***

### version

> **version**: `string`

Defined in: [packages/artifacts/src/types.ts:25](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/artifacts/src/types.ts#L25)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`version`](HardkasArtifactBase.md#version)
