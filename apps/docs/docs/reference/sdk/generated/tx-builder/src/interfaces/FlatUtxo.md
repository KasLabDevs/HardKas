[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [tx-builder/src](../README.md) / FlatUtxo

# Interface: FlatUtxo

Defined in: [packages/tx-builder/src/utxo-mapper.ts:6](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/utxo-mapper.ts#L6)

A flattened UTXO interface matching what query stores typically return.

## Properties

### address?

> `optional` **address?**: `string`

Defined in: [packages/tx-builder/src/utxo-mapper.ts:11](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/utxo-mapper.ts#L11)

***

### amountSompi

> **amountSompi**: `bigint`

Defined in: [packages/tx-builder/src/utxo-mapper.ts:9](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/utxo-mapper.ts#L9)

***

### blockDaaScore?

> `optional` **blockDaaScore?**: `string` \| `number` \| `bigint`

Defined in: [packages/tx-builder/src/utxo-mapper.ts:16](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/utxo-mapper.ts#L16)

***

### covenantId?

> `optional` **covenantId?**: `string`

Defined in: [packages/tx-builder/src/utxo-mapper.ts:13](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/utxo-mapper.ts#L13)

COVENANT-UTXO-PAYMENT-FILTER-1: kept so the planner can leave a covenant's UTXO out.

***

### isCoinbase?

> `optional` **isCoinbase?**: `boolean`

Defined in: [packages/tx-builder/src/utxo-mapper.ts:15](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/utxo-mapper.ts#L15)

HK-10: kept so the planners can leave an immature coinbase out.

***

### outputIndex

> **outputIndex**: `number`

Defined in: [packages/tx-builder/src/utxo-mapper.ts:8](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/utxo-mapper.ts#L8)

***

### scriptPublicKey

> **scriptPublicKey**: `string`

Defined in: [packages/tx-builder/src/utxo-mapper.ts:10](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/utxo-mapper.ts#L10)

***

### transactionId

> **transactionId**: `string`

Defined in: [packages/tx-builder/src/utxo-mapper.ts:7](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/tx-builder/src/utxo-mapper.ts#L7)
