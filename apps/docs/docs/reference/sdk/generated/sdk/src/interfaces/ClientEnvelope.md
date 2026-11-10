[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ClientEnvelope

# Interface: ClientEnvelope\<T\>

Defined in: [packages/sdk/src/client.ts:6](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/client.ts#L6)

## Type Parameters

### T

`T`

## Properties

### data?

> `optional` **data?**: `T`

Defined in: [packages/sdk/src/client.ts:8](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/client.ts#L8)

***

### error?

> `optional` **error?**: `object`

Defined in: [packages/sdk/src/client.ts:9](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/client.ts#L9)

#### code

> **code**: `string`

#### idempotencyKey?

> `optional` **idempotencyKey?**: `string`

P0-1A: on TX_SEND_OUTCOME_UNKNOWN, the key that makes a repeated request for the same payment safe.

#### message

> **message**: `string`

***

### meta

> **meta**: `object`

Defined in: [packages/sdk/src/client.ts:16](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/client.ts#L16)

#### mode?

> `optional` **mode?**: `string`

#### network

> **network**: `string`

#### workspace

> **workspace**: `string`

***

### ok

> **ok**: `boolean`

Defined in: [packages/sdk/src/client.ts:7](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/client.ts#L7)

***

### warnings

> **warnings**: `string`[]

Defined in: [packages/sdk/src/client.ts:15](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/sdk/src/client.ts#L15)
