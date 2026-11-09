[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / PaymentReceiptArtifactV1

# Interface: PaymentReceiptArtifactV1

Defined in: [packages/artifacts/src/types.ts:194](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L194)

## Extends

- [`HardkasArtifactBase`](HardkasArtifactBase.md)

## Properties

### amountFoundSompi

> `readonly` **amountFoundSompi**: `string`

Defined in: [packages/artifacts/src/types.ts:200](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L200)

***

### claims

> `readonly` **claims**: `object`

Defined in: [packages/artifacts/src/types.ts:213](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L213)

#### absoluteFinality

> `readonly` **absoluteFinality**: `boolean`

#### economicSafetyGuarantee

> `readonly` **economicSafetyGuarantee**: `boolean`

#### mainnet

> `readonly` **mainnet**: `boolean`

#### productionSettlement

> `readonly` **productionSettlement**: `boolean`

***

### confirmations

> `readonly` **confirmations**: `number`

Defined in: [packages/artifacts/src/types.ts:202](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L202)

***

### createdAt

> **createdAt**: `string`

Defined in: [packages/artifacts/src/types.ts:29](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L29)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`createdAt`](HardkasArtifactBase.md#createdat)

***

### expectedAmountSompi

> `readonly` **expectedAmountSompi**: `string`

Defined in: [packages/artifacts/src/types.ts:199](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L199)

***

### hardkasVersion

> **hardkasVersion**: `string`

Defined in: [packages/artifacts/src/types.ts:24](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L24)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`hardkasVersion`](HardkasArtifactBase.md#hardkasversion)

***

### hashVersion?

> `optional` **hashVersion?**: `string` \| `number`

Defined in: [packages/artifacts/src/types.ts:26](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L26)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`hashVersion`](HardkasArtifactBase.md#hashversion)

***

### invoiceId

> `readonly` **invoiceId**: `string`

Defined in: [packages/artifacts/src/types.ts:196](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L196)

***

### merchantId

> `readonly` **merchantId**: `string`

Defined in: [packages/artifacts/src/types.ts:197](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L197)

***

### mode

> **mode**: [`AnyExecutionMode`](../type-aliases/AnyExecutionMode.md)

Defined in: [packages/artifacts/src/types.ts:28](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L28)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`mode`](HardkasArtifactBase.md#mode)

***

### networkId

> **networkId**: [`NetworkId`](../../../sdk/src/type-aliases/NetworkId.md)

Defined in: [packages/artifacts/src/types.ts:27](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L27)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`networkId`](HardkasArtifactBase.md#networkid)

***

### paidAt

> `readonly` **paidAt**: `number`

Defined in: [packages/artifacts/src/types.ts:205](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L205)

***

### paymentAddress

> `readonly` **paymentAddress**: `string`

Defined in: [packages/artifacts/src/types.ts:198](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L198)

***

### policy

> `readonly` **policy**: `object`

Defined in: [packages/artifacts/src/types.ts:206](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L206)

#### model

> `readonly` **model**: `string`

#### riskProfile

> `readonly` **riskProfile**: `string`

***

### requiredConfirmations

> `readonly` **requiredConfirmations**: `number`

Defined in: [packages/artifacts/src/types.ts:203](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L203)

***

### schema

> `readonly` **schema**: `"hardkas.paymentReceipt.v1"`

Defined in: [packages/artifacts/src/types.ts:195](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L195)

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

> `readonly` **status**: `"paid"`

Defined in: [packages/artifacts/src/types.ts:204](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L204)

***

### tracker

> `readonly` **tracker**: `object`

Defined in: [packages/artifacts/src/types.ts:210](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L210)

#### model

> `readonly` **model**: `string`

***

### txId

> `readonly` **txId**: `string`

Defined in: [packages/artifacts/src/types.ts:201](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L201)

***

### version

> **version**: `string`

Defined in: [packages/artifacts/src/types.ts:25](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L25)

#### Inherited from

[`HardkasArtifactBase`](HardkasArtifactBase.md).[`version`](HardkasArtifactBase.md#version)
