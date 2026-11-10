[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / DeploymentRecord

# Interface: DeploymentRecord

Defined in: [packages/artifacts/src/types.ts:571](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L571)

## Extends

- [`HardkasArtifactBase`](HardkasArtifactBase.md)

## Properties

### contentHash?

> `optional` **contentHash?**: `ContentHash`

Defined in: [packages/artifacts/src/types.ts:596](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L596)

Canonical content hash of this record

***

### createdAt

> **createdAt**: `string`

Defined in: [packages/artifacts/src/types.ts:29](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L29)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`createdAt`](HardkasArtifactBase.md#createdat)

***

### deployedAddresses?

> `optional` **deployedAddresses?**: `string`[]

Defined in: [packages/artifacts/src/types.ts:586](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L586)

Deployed addresses or outputs (for covenant/contract deployments)

***

### deployedAt

> **deployedAt**: `string`

Defined in: [packages/artifacts/src/types.ts:592](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L592)

Timestamp of deployment

***

### deployer?

> `optional` **deployer?**: `string`

Defined in: [packages/artifacts/src/types.ts:588](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L588)

Deployment metadata

***

### hardkasVersion

> **hardkasVersion**: `string`

Defined in: [packages/artifacts/src/types.ts:594](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L594)

HardKAS version used

#### Overrides

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`hardkasVersion`](HardkasArtifactBase.md#hardkasversion)

***

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

Defined in: [packages/artifacts/src/types.ts:26](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L26)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`hashVersion`](HardkasArtifactBase.md#hashversion)

***

### label

> **label**: `string`

Defined in: [packages/artifacts/src/types.ts:574](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L574)

Human-readable label (e.g., "initial-funding", "vault-covenant-v1")

***

### mode

> **mode**: [`AnyExecutionMode`](../type-aliases/AnyExecutionMode.md)

Defined in: [packages/artifacts/src/types.ts:28](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L28)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`mode`](HardkasArtifactBase.md#mode)

***

### networkId

> **networkId**: [`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

Defined in: [packages/artifacts/src/types.ts:576](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L576)

Network where this was deployed

#### Overrides

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`networkId`](HardkasArtifactBase.md#networkid)

***

### notes?

> `optional` **notes?**: `string`

Defined in: [packages/artifacts/src/types.ts:598](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L598)

Notes

***

### payloadHash?

> `optional` **payloadHash?**: `string`

Defined in: [packages/artifacts/src/types.ts:590](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L590)

Content hash of the deployed payload (bytecode, script, or tx content)

***

### planArtifactId?

> `optional` **planArtifactId?**: [`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

Defined in: [packages/artifacts/src/types.ts:582](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L582)

Reference to the plan artifact that produced this deployment

***

### receiptArtifactId?

> `optional` **receiptArtifactId?**: [`ArtifactId`](../../../sdk/src/type-aliases/ArtifactId.md)

Defined in: [packages/artifacts/src/types.ts:584](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L584)

Reference to the receipt artifact (if confirmed)

***

### schema

> **schema**: `"hardkas.deployment.v1"`

Defined in: [packages/artifacts/src/types.ts:572](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L572)

#### Overrides

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`schema`](HardkasArtifactBase.md#schema)

***

### schemaVersion?

> `optional` **schemaVersion?**: `string`

Defined in: [packages/artifacts/src/types.ts:23](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L23)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`schemaVersion`](HardkasArtifactBase.md#schemaversion)

***

### status

> **status**: `"unknown"` \| `"confirmed"` \| `"failed"` \| `"planned"` \| `"sent"`

Defined in: [packages/artifacts/src/types.ts:578](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L578)

Deployment status

***

### txId?

> `optional` **txId?**: [`TxId`](../../../sdk/src/type-aliases/TxId.md)

Defined in: [packages/artifacts/src/types.ts:580](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L580)

The transaction ID (if sent)

***

### version

> **version**: `string`

Defined in: [packages/artifacts/src/types.ts:25](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L25)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`version`](HardkasArtifactBase.md#version)
