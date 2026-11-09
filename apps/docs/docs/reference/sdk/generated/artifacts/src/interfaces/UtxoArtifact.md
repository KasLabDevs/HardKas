[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / UtxoArtifact

# Interface: UtxoArtifact

Defined in: [packages/artifacts/src/types.ts:76](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L76)

## Properties

### address

> `readonly` **address**: [`KaspaAddress`](../../../sdk/src/type-aliases/KaspaAddress.md)

Defined in: [packages/artifacts/src/types.ts:81](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L81)

***

### amountSompi

> `readonly` **amountSompi**: `string`

Defined in: [packages/artifacts/src/types.ts:82](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L82)

***

### blockDaaScore?

> `readonly` `optional` **blockDaaScore?**: `string`

Defined in: [packages/artifacts/src/types.ts:84](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L84)

***

### covenantId?

> `readonly` `optional` **covenantId?**: `string`

Defined in: [packages/artifacts/src/types.ts:87](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L87)

COVENANT-UTXO-PAYMENT-FILTER-1C: set when the UTXO belongs to a covenant (KIP-20); a payment never spends it.

***

### isCoinbase?

> `readonly` `optional` **isCoinbase?**: `boolean`

Defined in: [packages/artifacts/src/types.ts:85](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L85)

***

### outpoint

> `readonly` **outpoint**: `object`

Defined in: [packages/artifacts/src/types.ts:77](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L77)

#### index

> `readonly` **index**: `number`

#### transactionId

> `readonly` **transactionId**: [`TxId`](../../../sdk/src/type-aliases/TxId.md)

***

### scriptPublicKey

> `readonly` **scriptPublicKey**: `string`

Defined in: [packages/artifacts/src/types.ts:83](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/types.ts#L83)
