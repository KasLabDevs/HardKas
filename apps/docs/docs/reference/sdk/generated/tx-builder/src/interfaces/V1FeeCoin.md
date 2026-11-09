[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / V1FeeCoin

# Interface: V1FeeCoin

Defined in: [packages/tx-builder/src/v1-fee-inputs.ts:15](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-fee-inputs.ts#L15)

## Properties

### amountSompi

> `readonly` **amountSompi**: `bigint`

Defined in: [packages/tx-builder/src/v1-fee-inputs.ts:17](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-fee-inputs.ts#L17)

***

### blockDaaScore?

> `readonly` `optional` **blockDaaScore?**: `bigint`

Defined in: [packages/tx-builder/src/v1-fee-inputs.ts:20](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-fee-inputs.ts#L20)

***

### covenantId?

> `readonly` `optional` **covenantId?**: `string`

Defined in: [packages/tx-builder/src/v1-fee-inputs.ts:22](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-fee-inputs.ts#L22)

***

### isCoinbase?

> `readonly` `optional` **isCoinbase?**: `boolean`

Defined in: [packages/tx-builder/src/v1-fee-inputs.ts:21](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-fee-inputs.ts#L21)

***

### outpoint

> `readonly` **outpoint**: `object`

Defined in: [packages/tx-builder/src/v1-fee-inputs.ts:16](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-fee-inputs.ts#L16)

#### index

> `readonly` **index**: `number`

#### transactionId

> `readonly` **transactionId**: `string`

***

### scriptPublicKey

> `readonly` **scriptPublicKey**: `string`

Defined in: [packages/tx-builder/src/v1-fee-inputs.ts:19](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/v1-fee-inputs.ts#L19)

"\<2-byte version\>\<script\>" hex, as the node lists it.
